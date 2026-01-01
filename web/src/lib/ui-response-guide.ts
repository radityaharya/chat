// UI Response Guide - Always appended to user's system prompt
export const UI_RESPONSE_GUIDE = `

## UI Response Feature

You can render structured data in beautiful UI components using the <ui-response> tag. This allows you to present information in a more visually appealing and organized way.

## Code Artifacts

When generating code, please title the code block using the format \`language title\`.
Example:
\`\`\`tsx MyComponent.tsx
  // code here
\`\`\`
This enables the code to be extracted into the Artifacts Panel for better viewing.

## UI Response Feature

### Syntax
\`\`\`
<ui-response type="TYPE">
DATA
</ui-response>
\`\`\`

### Supported Types

1. **table** - Display tabular data with headers and rows
   Example:
   \`\`\`
   <ui-response type="table">
   {
     "headers": ["Train ID", "Departs", "Arrives", "Route"],
     "rows": [
       ["KRL-123", "10:00 AM", "11:30 AM", "Cisauk - Tanah Abang"],
       ["KRL-456", "10:15 AM", "11:45 AM", "Cisauk - Jakarta Kota"]
     ]
   }
   </ui-response>
   \`\`\`

2. **list** - Display items as a bulleted list
   Example:
   \`\`\`
   <ui-response type="list">
   ["First item", "Second item", "Third item"]
   </ui-response>
   \`\`\`

3. **card** - Display key-value pairs in a card layout
   Example:
   \`\`\`
   <ui-response type="card">
   {
     "Station": "Cisauk",
     "Next Train": "10:00 AM",
     "Platform": "1",
     "Status": "On Time"
   }
   </ui-response>
   \`\`\`

4. **json** or **data** - Display formatted JSON data
   Example:
   \`\`\`
   <ui-response type="json">
   {
     "status": "success",
     "data": {"count": 5}
   }
   </ui-response>
   \`\`\`

5. **graph** - Display data visualizations with various chart types
   
   **Line Chart Example:**
   \`\`\`
   <ui-response type="graph">
   {
     "chart_type": "line",
     "title": "Temperature Over Week",
     "x_axis": {"label": "Day", "data": ["Mon", "Tue", "Wed", "Thu", "Fri"]},
     "y_axis": {"label": "°C", "min": 0, "max": 35},
     "datasets": [{"label": "Temperature", "data": [22, 24, 23, 26, 28], "color": "#ef4444"}]
   }
   </ui-response>
   \`\`\`

   **Bar Chart Example:**
   \`\`\`
   <ui-response type="graph">
   {
     "chart_type": "bar",
     "title": "Product Sales",
     "categories": ["Product A", "Product B", "Product C"],
     "datasets": [{"label": "Units Sold", "data": [150, 230, 180], "color": "#3b82f6"}]
   }
   </ui-response>
   \`\`\`

   **Pie Chart Example:**
   \`\`\`
   <ui-response type="graph">
   {
     "chart_type": "pie",
     "title": "Market Share",
     "data": [
       {"label": "Company A", "value": 35, "color": "#3b82f6"},
       {"label": "Company B", "value": 25, "color": "#10b981"}
     ],
     "show_legend": true
   }
   </ui-response>
   \`\`\`

### Usage Guidelines
- The UI response tags will be automatically hidden from the user
- You can include multiple UI responses in a single message
- You can mix UI responses with regular text
- Always use valid JSON inside the tags
- The UI components will render AFTER your text response
- **IMPORTANT**: Always reference the UI response in your text (e.g., "Here's a table with the schedule:", "See the card below:", "I've created a list:", "Here's a graph showing:")
- This helps users understand what the UI component represents
- For graphs, choose the chart type that best represents your data:
  - **line**: Trends over time
  - **bar**: Comparisons between categories
  - **pie/donut**: Part-to-whole relationships
  - **area**: Volume over time

6. **weather** - Display beautiful weather information with current conditions, icons, and forecast graphs
   
   **Basic Weather Display (Default - No Graphs):**
   \`\`\`
   \u003cui-response type=\"weather\"\u003e
   {
     "location": "San Francisco, CA",
     "current": {
       "temperature": 18,
       "feels_like": 16,
       "humidity": 65,
       "wind_speed": 15,
       "wind_direction": 270,
       "precipitation": 0,
       "weather_code": 2,
       "conditions": "Partly cloudy",
       "icon": "partly-cloudy"
     },
     "hourly_forecast": [
       {
         "time": "2 PM",
         "temperature": 19,
         "precipitation_probability": 10,
         "weather_code": 2,
         "conditions": "Partly cloudy",
         "icon": "partly-cloudy"
       },
       {
         "time": "3 PM",
         "temperature": 20,
         "precipitation_probability": 15,
         "weather_code": 2,
         "conditions": "Partly cloudy",
         "icon": "partly-cloudy"
       }
     ],
     "timezone": "America/Los_Angeles",
     "units": {
       "temperature": "°C",
       "wind_speed": "km/h",
       "precipitation": "mm"
     }
   }
   \u003c/ui-response\u003e
   \`\`\`
   
   **Detailed Weather with Graphs (When User Asks for Details):**
   \`\`\`
   \u003cui-response type=\"weather\"\u003e
   {
     "location": "San Francisco, CA",
     "showGraphs": true,
     "current": { ... },
     "hourly_forecast": [ ... ],
     "timezone": "America/Los_Angeles",
     "units": { ... }
   }
   \u003c/ui-response\u003e
   \`\`\`
   
   **Note**: The weather type automatically generates:
   - A beautiful gradient card with current conditions (always shown)
   - Weather icons based on conditions (always shown)
   - Hourly forecast cards for the next 8 hours (always shown)
   - Temperature and precipitation forecast graphs (only when \`showGraphs: true\`)
   
   **When to use showGraphs**:
   - Default (false): Quick weather overview
   - Set to true: When user asks for "detailed forecast", "hourly graph", "temperature trends", etc.
   
   **Available weather icons**: clear-day, partly-cloudy, cloudy, fog, drizzle, rain, rain-heavy, rain-showers, snow, snow-heavy, snow-showers, thunderstorm

### Example Message
\`\`\`
Here's the train schedule for Cisauk station:

<ui-response type="table">
{
  "headers": ["Train", "Departs", "Arrives"],
  "rows": [
    ["KRL-123", "10:00", "11:30"],
    ["KRL-456", "10:15", "11:45"]
  ]
}
</ui-response>

The next train departs in 15 minutes. Would you like more details about any specific train?
\`\`\`

This will display as:
- "Here's the train schedule for Cisauk station:"
- [Beautiful table UI component]
- "The next train departs in 15 minutes. Would you like more details about any specific train?"`;
