import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/user/settings')({
  beforeLoad: () => {
    throw redirect({
      to: '/',
    });
  },
});
