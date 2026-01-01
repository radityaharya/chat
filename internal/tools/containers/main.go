package containers

import (
	"archive/tar"
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"
	"go.uber.org/zap"
)

const (
	DefaultImage = "ubuntu:latest"
)

type Client struct {
	cli    *client.Client
	logger *zap.Logger
}

type ContainerInfo struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	Image  string `json:"image"`
}

// NewClient creates a new Docker client.
// host can be a unix socket path (unix:///var/run/docker.sock) or tcp endpoint (tcp://localhost:2375)
// if host is empty, it attempts to use defaults from environment
func NewClient(host string, logger *zap.Logger) (*Client, error) {
	var opts []client.Opt
	opts = append(opts, client.WithAPIVersionNegotiation())

	if host != "" {
		opts = append(opts, client.WithHost(host))
	} else {
		opts = append(opts, client.FromEnv)
	}

	cli, err := client.NewClientWithOpts(opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to create docker client (check if docker socket is mounted): %w", err)
	}

	return &Client{
		cli:    cli,
		logger: logger,
	}, nil
}

func (c *Client) Close() error {
	return c.cli.Close()
}

// Manage handles container lifecycle: create, start, stop, remove, status, reset
func (c *Client) Manage(ctx context.Context, action string, containerName string) (*ContainerInfo, error) {
	c.logger.Info("Manage detected action", zap.String("action", action), zap.String("container", containerName))

	switch action {
	case "status":
		return c.getContainerStatus(ctx, containerName)
	case "create":
		// Check if exists first
		info, err := c.getContainerStatus(ctx, containerName)
		if err == nil && info != nil {
			c.logger.Info("Container already exists", zap.String("container", containerName))
			return info, nil // Already exists
		}
		return c.createContainer(ctx, containerName)
	case "start":
		// Ensure it exists before starting
		_, err := c.getContainerStatus(ctx, containerName)
		if err != nil {
			c.logger.Info("Container not found during start, creating...", zap.String("container", containerName))
			// Assume it doesn't exist (or error getting status), try to create
			_, err := c.createContainer(ctx, containerName)
			if err != nil {
				return nil, fmt.Errorf("failed to create container on start: %w", err)
			}
		}
		return c.startContainer(ctx, containerName)
	case "stop":
		return c.stopContainer(ctx, containerName)
	case "remove":
		return c.removeContainer(ctx, containerName)
	case "reset":
		c.logger.Info("Resetting container...", zap.String("container", containerName))
		// Stop and remove if exists, then create and start
		_, _ = c.stopContainer(ctx, containerName)
		_, _ = c.removeContainer(ctx, containerName)
		_, err := c.createContainer(ctx, containerName)
		if err != nil {
			return nil, err
		}
		return c.startContainer(ctx, containerName)
	default:
		return nil, fmt.Errorf("unknown action: %s", action)
	}
}

func (c *Client) getContainerStatus(ctx context.Context, name string) (*ContainerInfo, error) {
	containers, err := c.cli.ContainerList(ctx, container.ListOptions{
		All:     true,
		Filters: filters.NewArgs(filters.Arg("name", "^/"+name+"$")),
	})
	if err != nil {
		return nil, err
	}

	if len(containers) == 0 {
		return nil, fmt.Errorf("container not found")
	}

	return &ContainerInfo{
		ID:     containers[0].ID,
		Status: containers[0].State,
		Image:  containers[0].Image,
	}, nil
}

func (c *Client) createContainer(ctx context.Context, name string) (*ContainerInfo, error) {
	// Ensure image exists
	_, _, err := c.cli.ImageInspectWithRaw(ctx, DefaultImage)
	if client.IsErrNotFound(err) {
		reader, err := c.cli.ImagePull(ctx, DefaultImage, image.PullOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to pull image: %w", err)
		}
		defer reader.Close()
		io.Copy(io.Discard, reader) // Wait for pull to finish
	}

	// ContainerCreate signature: ctx, config, hostConfig, networkingConfig, platform, containerName
	resp, err := c.cli.ContainerCreate(ctx, &container.Config{
		Image:        DefaultImage,
		Cmd:          []string{"tail", "-f", "/dev/null"}, // Keep running
		Tty:          true,
		OpenStdin:    true,
		AttachStdout: true,
		AttachStderr: true,
	}, &container.HostConfig{
		Resources: container.Resources{
			Memory:     1024 * 1024 * 1024, // 1GB
			MemorySwap: -1,                 // Unlimited swap
			NanoCPUs:   1000000000,         // 1 CPU
		},
	}, nil, nil, name)

	if err != nil {
		return nil, fmt.Errorf("failed to create container: %w", err)
	}

	c.logger.Info("Created container", zap.String("container", name), zap.String("id", resp.ID))

	return &ContainerInfo{
		ID:     resp.ID,
		Status: "created",
		Image:  DefaultImage,
	}, nil
}

func (c *Client) startContainer(ctx context.Context, name string) (*ContainerInfo, error) {
	c.logger.Info("Starting container...", zap.String("container", name))
	// ContainerStart signature: ctx, containerID, options
	err := c.cli.ContainerStart(ctx, name, container.StartOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to start container: %w", err)
	}

	// Wait for running state
	if err := c.waitForStatus(ctx, name, "running"); err != nil {
		return nil, fmt.Errorf("failed to wait for container start: %w", err)
	}

	c.logger.Info("Container started", zap.String("container", name))
	return c.getContainerStatus(ctx, name)
}

func (c *Client) stopContainer(ctx context.Context, name string) (*ContainerInfo, error) {
	c.logger.Info("Stopping container...", zap.String("container", name))
	timeout := 5 // seconds
	// ContainerStop signature: ctx, containerID, options (in newer SDKs) or timeout (older)
	// Using container.StopOptions structure for modern SDK
	err := c.cli.ContainerStop(ctx, name, container.StopOptions{Timeout: &timeout})
	if err != nil {
		if client.IsErrNotFound(err) {
			return nil, nil // Already gone
		}
		return nil, fmt.Errorf("failed to stop container: %w", err)
	}

	// Wait for exited state
	_ = c.waitForStatus(ctx, name, "exited") // Ignore error as it might disappear

	c.logger.Info("Container stopped", zap.String("container", name))
	return c.getContainerStatus(ctx, name)
}

func (c *Client) removeContainer(ctx context.Context, name string) (*ContainerInfo, error) {
	c.logger.Info("Removing container...", zap.String("container", name))
	// ContainerRemove signature: ctx, containerID, options
	err := c.cli.ContainerRemove(ctx, name, container.RemoveOptions{Force: true})
	if err != nil {
		if client.IsErrNotFound(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to remove container: %w", err)
	}
	c.logger.Info("Container removed", zap.String("container", name))
	return nil, nil
}

// waitForStatus polls until the container reaches the desired status
func (c *Client) waitForStatus(ctx context.Context, name, status string) error {
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()

	timeout := time.After(10 * time.Second)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-timeout:
			return fmt.Errorf("timeout waiting for container status %s", status)
		case <-ticker.C:
			info, err := c.getContainerStatus(ctx, name)
			if err != nil {
				// If we want "exited" and it's gone (not found), that's success?
				// getContainerStatus returns error if not found.
				// If we wait for running, error is bad.
				// If we wait for exited, error "not found" might mean it's removed?
				// Actually getContainerStatus returns error "container not found" if list is empty.
				if status == "exited" && strings.Contains(err.Error(), "not found") {
					return nil // effectively exited/gone
				}
				continue
			}
			if info.Status == status {
				return nil
			}
			// Docker status can also be "restarting", "created", etc.
			// "running" is what we want for start.
			// "exited" for stop.
		}
	}
}

// ensureContainerRunning checks if the container exists and is running.
// If not, it creates and/or starts it.
func (c *Client) ensureContainerRunning(ctx context.Context, name string) error {
	info, err := c.getContainerStatus(ctx, name)
	if err != nil {
		// Assume not found, try create
		c.logger.Info("Container not found (lazy init), creating...", zap.String("container", name))
		if _, err := c.createContainer(ctx, name); err != nil {
			return fmt.Errorf("failed to create container: %w", err)
		}
		// Now start it
		if _, err := c.startContainer(ctx, name); err != nil {
			return fmt.Errorf("failed to start container: %w", err)
		}
		return nil
	}

	if info.Status != "running" {
		c.logger.Info("Container exists but not running, starting...", zap.String("container", name), zap.String("status", info.Status))
		if _, err := c.startContainer(ctx, name); err != nil {
			return fmt.Errorf("failed to start container: %w", err)
		}
	}
	return nil
}

// Execute runs a command in the container and returns stdout/stderr and exit code
func (c *Client) Execute(ctx context.Context, containerName string, cmd []string, workDir string) (string, int, error) {
	if err := c.ensureContainerRunning(ctx, containerName); err != nil {
		return "", -1, err
	}

	c.logger.Info("Exec command", zap.String("container", containerName), zap.Strings("cmd", cmd), zap.String("workDir", workDir))

	execConfig := container.ExecOptions{
		AttachStdout: true,
		AttachStderr: true,
		Tty:          true, // Combined output
		WorkingDir:   workDir,
		Cmd:          cmd,
	}

	// Create exec
	execIDResp, err := c.cli.ContainerExecCreate(ctx, containerName, execConfig)
	if err != nil {
		c.logger.Error("Failed to create exec", zap.Error(err))
		return "", -1, fmt.Errorf("failed to create exec: %w", err)
	}

	// Attach
	resp, err := c.cli.ContainerExecAttach(ctx, execIDResp.ID, container.ExecStartOptions{
		Tty: true,
	})
	if err != nil {
		c.logger.Error("Failed to attach exec", zap.Error(err))
		return "", -1, fmt.Errorf("failed to attach exec: %w", err)
	}
	defer resp.Close()

	// Read output
	var outBuf bytes.Buffer
	outputDone := make(chan error)

	go func() {
		_, err := io.Copy(&outBuf, resp.Reader)
		outputDone <- err
	}()

	select {
	case err := <-outputDone:
		if err != nil {
			c.logger.Error("Error reading exec output", zap.Error(err))
			return "", -1, err
		}
	case <-ctx.Done():
		return "", -1, ctx.Err()
	}

	// Inspect to get exit code
	inspectResp, err := c.cli.ContainerExecInspect(ctx, execIDResp.ID)
	if err != nil {
		c.logger.Error("Failed to inspect exec", zap.Error(err))
		return outBuf.String(), -1, fmt.Errorf("failed to inspect exec: %w", err)
	}

	return outBuf.String(), inspectResp.ExitCode, nil
}

// WriteFile writes content to a file in the container
func (c *Client) WriteFile(ctx context.Context, containerName, path string, content []byte) error {
	if err := c.ensureContainerRunning(ctx, containerName); err != nil {
		return err
	}

	c.logger.Info("Writing file", zap.String("container", containerName), zap.String("path", path))

	// Create a tar archive containing the file
	buf := new(bytes.Buffer)
	tw := tar.NewWriter(buf)

	// Handle filename from path
	// We need to copy to the directory containing the file
	// But CopyToContainer expects the tar to contain the structure relative to the dest path
	// If dest is a directory, the tar content is extracted there.
	// If dest is a file path, it's tricky. Best is to copy to dirname(path) with the filename in tar.

	// Wait, simpler approach:
	// content is the file content.
	// We assume path is the full path /tmp/foo.txt
	// We put "foo.txt" in the tar, and copy to /tmp/

	parts := strings.Split(path, "/")
	fileName := parts[len(parts)-1]
	dirPath := strings.Join(parts[:len(parts)-1], "/")
	if dirPath == "" {
		dirPath = "/"
	}

	hdr := &tar.Header{
		Name: fileName,
		Mode: 0644,
		Size: int64(len(content)),
	}
	if err := tw.WriteHeader(hdr); err != nil {
		return err
	}
	if _, err := tw.Write(content); err != nil {
		return err
	}
	if err := tw.Close(); err != nil {
		return err
	}

	// CopyToContainer signature: ctx, container, path, content, options
	return c.cli.CopyToContainer(ctx, containerName, dirPath, buf, container.CopyToContainerOptions{})
}

// ReadFile reads a file from the container
func (c *Client) ReadFile(ctx context.Context, containerName, path string) ([]byte, error) {
	if err := c.ensureContainerRunning(ctx, containerName); err != nil {
		return nil, err
	}

	c.logger.Info("Reading file", zap.String("container", containerName), zap.String("path", path))

	// CopyFromContainer signature: ctx, container, path
	reader, _, err := c.cli.CopyFromContainer(ctx, containerName, path)
	if err != nil {
		return nil, err
	}
	defer reader.Close()

	tr := tar.NewReader(reader)

	// We expect the first entry to be the file (or the file itself if we asked for a file)
	// CopyFromContainer returns a tar stream.

	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}

		if header.Typeflag == tar.TypeReg {
			return io.ReadAll(tr)
		}
	}

	return nil, fmt.Errorf("file not found in tar stream")
}

// EnsureDirectory creates a directory in the container if it doesn't exist
func (c *Client) EnsureDirectory(ctx context.Context, containerName, path string) error {
	if err := c.ensureContainerRunning(ctx, containerName); err != nil {
		return err
	}

	cmd := []string{"mkdir", "-p", path}
	_, exitCode, err := c.Execute(ctx, containerName, cmd, "/")
	if err != nil {
		return err
	}
	if exitCode != 0 {
		return fmt.Errorf("failed to create directory, exit code: %d", exitCode)
	}
	return nil
}

// FileEntry represents a file or directory in the container
type FileEntry struct {
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	Mode    string `json:"mode"`
	IsDir   bool   `json:"is_dir"`
	ModTime string `json:"mod_time"` // output from ls --time-style=iso
}

// ListFiles lists files in a directory in the container
func (c *Client) ListFiles(ctx context.Context, containerName, path string) ([]FileEntry, error) {
	if err := c.ensureContainerRunning(ctx, containerName); err != nil {
		return nil, err
	}

	// ls -l --time-style=long-iso
	// output format: permissions links owner group size date time name
	// but busybox ls might be different.
	// Let's stick to standard `ls -l` and parse carefully, or `stat`.
	// Ideally we run a small script to output JSON or CSV.
	// "find . -maxdepth 1 -printf ..." is great but might not be available if minimal image.
	// Let's use `ls -la`.

	cmd := []string{"ls", "-la", "--time-style=long-iso", path}
	output, exitCode, err := c.Execute(ctx, containerName, cmd, "/")
	if err != nil || exitCode != 0 {
		// Fallback to simpler ls if long-iso not supported?
		// Ubuntu usually has it.
		// If fails, try just ls -la
		if exitCode != 0 {
			cmd = []string{"ls", "-la", path}
			output, exitCode, err = c.Execute(ctx, containerName, cmd, "/")
		}
	}

	if err != nil {
		return nil, err
	}
	if exitCode != 0 {
		return nil, fmt.Errorf("ls failed: %s", output)
	}

	var entries []FileEntry
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "total") {
			continue
		}

		// Parsing is fragile.
		// drwxr-xr-x 2 root root 4096 2024-01-01 12:00 .
		fields := strings.Fields(line)
		if len(fields) < 8 {
			continue
		}

		// Basic parsing
		isDir := strings.HasPrefix(fields[0], "d")
		name := strings.Join(fields[7:], " ") // Valid for long-iso which has date time
		// If fallback ls -la (no --time-style), fields might differ.
		// Let's refine:
		// [perms] [links] [owner] [group] [size] [date] [time] [name...]

		// Skip . and ..
		if name == "." || name == ".." {
			continue
		}

		entry := FileEntry{
			Name:    name,
			Mode:    fields[0],
			IsDir:   isDir,
			ModTime: fmt.Sprintf("%s %s", fields[5], fields[6]),
		}

		// Parse size?
		// fields[4] is usually size
		fmt.Sscanf(fields[4], "%d", &entry.Size)

		entries = append(entries, entry)
	}

	return entries, nil
}
