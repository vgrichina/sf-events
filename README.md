# SF Events Finder

A tool to fetch and process live music events in San Francisco, Berkeley, and Oakland.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Run the event fetcher:
   ```
   npm run fetch
   ```
   This will download HTML from all venues in the sources.csv file and save it to the html_dumps directory.

3. Process the HTML to extract events:
   ```
   npm run process
   ```
   This will parse the HTML files and extract event information using the CSS selectors specified in sources.csv.

4. Or run all steps in sequence:
   ```
   # Run fetch and process
   npm run events
   
   # Run fetch, process, and LLM cleanup (requires API key)
   npm run tonight
   ```

## How It Works

1. The `sources.csv` file contains a list of venues and event aggregators with their URLs and CSS selectors for extracting event information.

2. The `fetch-html.js` script uses Puppeteer to visit each URL and save the HTML, along with a screenshot.

3. The `process-html.js` script uses Cheerio to parse the HTML and extract event information based on the CSS selectors. It then generates a markdown report of all events.

## Adding New Venues

To add a new venue, add a row to `sources.csv` with the following columns:

- `source`: The name of the venue or event source
- `type`: The type of source (venue, aggregator, promoter)
- `region`: The region (SF, Berkeley, Oakland, etc.)
- `url`: The URL of the venue's event page
- `container_selector`: CSS selector for the container element that wraps each event
- `title_selector`: CSS selector for the event title within the container
- `date_selector`: CSS selector for the event date within the container
- `time_selector`: CSS selector for the event time within the container
- `url_selector`: CSS selector for the event URL (usually an <a> element) within the container
- `extraction_type`: "standard" for HTML parsing, "json" for sites with embedded JSON data

## Output

- `html_dumps/`: Contains the raw HTML and screenshots from each venue
- `processed_data/`: Contains the extracted event data
  - `all_events.json`: All events from all venues
  - `events_YYYY-MM-DD.json`: JSON file with events specifically for today's date
  - `events_YYYY-MM-DD.md`: Markdown report of events for the current date

### Markdown Output Format

The generated markdown file (`tonights_events.md`) organizes events by:
1. Region (SF, Berkeley, Oakland, etc.)
2. Venue within each region
3. Individual events at each venue

For each event, it displays:
- Event title
- Date (when available)
- Time (when available)
- "Get Tickets" link to the event page

## Advanced Features

### JSON Extraction

For sites that load event data dynamically (like Eventbrite and Bandsintown), we support extracting events directly from embedded JSON data:

1. Set `extraction_type` to "json" in sources.csv
2. The script will look for embedded JSON data structures containing event information
3. If JSON extraction fails, it will fall back to standard HTML parsing

### LLM-Powered Event Cleanup

The tool can use Claude 3.5 Haiku via the OpenRouter API to clean up and normalize the extracted event data:

1. Run `npm run cleanup` after processing events to clean the data
2. Or use `npm run tonight` to run the entire pipeline (fetch, process, cleanup)
3. Requires an OpenRouter API key set in the `OPENROUTER_API_KEY` environment variable

The LLM cleanup provides these benefits:
- Normalizes date and time formats
- Fixes parsing issues and irregular spacing
- Verifies that "is_today" flags are accurate
- Removes duplicate events
- Creates consistent formatting

### Date Filtering

The script now actively filters for today's events with support for various date formats:
- Direct matches like "today" or "tonight"
- Month/day formats like "May 2" or "5/2"
- Day abbreviations like "Fri" combined with the date
- Numeric formats like "5.2" (M.D)
- Full ISO dates

For each event, the script checks:
1. If the event has been marked as today's event by the extraction logic
2. If the date text contains today's date in various formats
3. If the date can be parsed to match today's date

## Debugging

To debug issues with specific venues, you can pass the venue name as a command-line argument to the processing script:

```
node process-html.js "Venue Name"
```

For example:
```
node process-html.js "Bottom of the Hill"
```

This will enable detailed debug output for that specific venue, including:
- Selector information
- HTML structure of containers
- Elements found for each selector
- Extracted content from each selector

## Notes

- Some venues use anti-scraping measures that may prevent automatic extraction
- The CSS selectors may need to be updated if venues change their website designs
- The script uses a random delay between requests to avoid being blocked
- For sites with advanced bot protection, you may need to use more sophisticated techniques
- You can also run `node fetch-html.js "Venue Name"` to fetch only a specific venue