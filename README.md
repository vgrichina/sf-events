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

4. Or run both in sequence:
   ```
   npm run events
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
- `extraction_type`: Usually "standard", can be "custom" for special handling

## Output

- `html_dumps/`: Contains the raw HTML and screenshots from each venue
- `processed_data/`: Contains the extracted event data
  - `all_events.json`: All events from all venues
  - `events_YYYY-MM-DD.md`: Markdown report of events for the current date

## Notes

- Some venues use anti-scraping measures that may prevent automatic extraction
- The CSS selectors may need to be updated if venues change their website designs
- The script uses a random delay between requests to avoid being blocked