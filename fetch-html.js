const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// Create output directory if it doesn't exist
const outputDir = path.join(__dirname, 'html_dumps');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Function to sanitize URL for filenames
const sanitizeFilename = (url) => {
  return url.replace(/[^a-z0-9]/gi, '_').toLowerCase();
};

// Main function to fetch and save HTML
async function fetchAndSaveHtml(targetVenue = null) {
  // Create a list to store results for reporting
  const results = [];
  
  // Parse the CSV file
  const sources = [];
  fs.createReadStream(path.join(__dirname, 'sources.csv'))
    .pipe(csv())
    .on('data', (data) => sources.push(data))
    .on('end', async () => {
      // Filter sources if a target venue is specified
      const sourcesToProcess = targetVenue 
        ? sources.filter(s => s.source.toLowerCase() === targetVenue.toLowerCase())
        : sources;
      
      if (targetVenue && sourcesToProcess.length === 0) {
        console.error(`Venue "${targetVenue}" not found in sources.csv`);
        return;
      }
      
      console.log(`Found ${sourcesToProcess.length} source${sourcesToProcess.length === 1 ? '' : 's'} to process`);
      
      // Launch browser
      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      // Process each source
      for (const source of sourcesToProcess) {
        try {
          console.log(`Processing: ${source.source} - ${source.url}`);
          
          // Create a new page
          const page = await browser.newPage();
          
          // Set user agent to avoid detection
          await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');
          
          // Set viewport to desktop size
          await page.setViewport({ width: 1280, height: 800 });
          
          // Set timeout to 30 seconds
          await page.setDefaultNavigationTimeout(30000);
          
          // Navigate to the URL
          await page.goto(source.url, { waitUntil: 'networkidle2' });
          
          // Wait for content to load - specifically for event containers
          if (source.container_selector) {
            try {
              await page.waitForSelector(source.container_selector, { timeout: 5000 });
            } catch (error) {
              console.log(`  - Container selector not found: ${source.container_selector}`);
            }
          }
          
          // Wait additional time for dynamic content
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Get page content
          const html = await page.content();
          
          // Create filename from source name and URL
          const filename = `${source.source.replace(/\s+/g, '_')}_${sanitizeFilename(source.url)}.html`;
          const filepath = path.join(outputDir, filename);
          
          // Save HTML to file
          fs.writeFileSync(filepath, html);
          
          // Try to take a screenshot as well
          try {
            await page.screenshot({ path: path.join(outputDir, `${source.source.replace(/\s+/g, '_')}.png`), fullPage: false });
          } catch (error) {
            console.log(`  - Failed to take screenshot: ${error.message}`);
          }
          
          // Add to results
          results.push({
            source: source.source,
            url: source.url,
            success: true,
            file: filename,
            selectors: {
              container: source.container_selector,
              title: source.title_selector,
              date: source.date_selector,
              time: source.time_selector,
              url: source.url_selector,
              extraction_type: source.extraction_type
            }
          });
          
          console.log(`✓ Saved HTML for ${source.source}`);
          
          // Close the page
          await page.close();
          
          // Random delay between requests (1-3 seconds)
          const delay = Math.floor(Math.random() * 2000) + 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          
        } catch (error) {
          console.error(`✗ Error processing ${source.source}: ${error.message}`);
          
          // Add to results
          results.push({
            source: source.source,
            url: source.url,
            success: false,
            error: error.message
          });
        }
      }
      
      // Close browser
      await browser.close();
      
      // Save results report
      const reportPath = path.join(__dirname, 'fetch_results.json');
      fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
      
      // Print summary
      const successful = results.filter(r => r.success).length;
      console.log(`\nFetch Summary:`);
      console.log(`- Total sources: ${sources.length}`);
      console.log(`- Successfully fetched: ${successful}`);
      console.log(`- Failed: ${sources.length - successful}`);
      console.log(`\nHTML files saved to: ${outputDir}`);
      console.log(`Results report saved to: ${reportPath}`);
    });
}

// Process command-line arguments
const args = process.argv.slice(2);
const targetVenue = args.length > 0 ? args[0] : null;

// Run the main function
fetchAndSaveHtml(targetVenue).catch(err => {
  console.error('Fatal error:', err);
});