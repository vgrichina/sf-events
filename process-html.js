const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const csv = require('csv-parser');

// Create output directory for processed data
const outputDir = path.join(__dirname, 'processed_data');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Get today's date in YYYY-MM-DD format
const today = new Date();
const todayString = today.toISOString().split('T')[0];
const todayDate = today.getDate();
const todayMonth = today.getMonth() + 1; // JS months are 0-indexed
const todayYear = today.getFullYear();

// Load the CSV file with sources and selectors
const sources = [];
fs.createReadStream(path.join(__dirname, 'sources.csv'))
  .pipe(csv())
  .on('data', (data) => sources.push(data))
  .on('end', () => {
    // Load fetch results to get file paths
    const fetchResultsPath = path.join(__dirname, 'fetch_results.json');
    if (!fs.existsSync(fetchResultsPath)) {
      console.error('fetch_results.json not found! Please run fetch-html.js first.');
      process.exit(1);
    }

    const fetchResults = JSON.parse(fs.readFileSync(fetchResultsPath, 'utf8'));
    const successfulFetches = fetchResults.filter(result => result.success);
    
    // Process the HTML files
    processHtmlFiles(successfulFetches, sources);
  });

// Function to check if text might contain a date
function mightContainDate(text) {
  if (!text) return false;
  
  // Common date patterns
  const datePatterns = [
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i, // Month names
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i, // Full month names
    /\b(mon|tue|wed|thu|fri|sat|sun)\b/i, // Day names
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, // Full day names
    /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/, // MM/DD or MM/DD/YYYY
    /\b\d{1,2}-\d{1,2}(-\d{2,4})?\b/, // MM-DD or MM-DD-YYYY
    /\b\d{1,2}\.\d{1,2}(\.\d{2,4})?\b/, // MM.DD or MM.DD.YYYY
    /\b(today|tomorrow|tonight)\b/i // Special keywords
  ];
  
  return datePatterns.some(pattern => pattern.test(text));
}

// Function to check if text might contain a time
function mightContainTime(text) {
  if (!text) return false;
  
  // Common time patterns
  const timePatterns = [
    /\b\d{1,2}:\d{2}\b/, // HH:MM
    /\b\d{1,2}(am|pm)\b/i, // HHam/pm
    /\b\d{1,2}:\d{2}(am|pm)\b/i, // HH:MMam/pm
    /\b\d{1,2}\s*(am|pm)\b/i, // HH am/pm
    /\b(doors|show|start).{1,10}\d{1,2}/i // "doors at 8" etc.
  ];
  
  return timePatterns.some(pattern => pattern.test(text));
}

// Main function to process HTML files
function processHtmlFiles(fetches, sources) {
  const allEvents = [];
  
  console.log(`Processing ${fetches.length} HTML files...`);
  
  // Process each HTML file
  fetches.forEach(fetch => {
    try {
      console.log(`\nProcessing ${fetch.source}: ${fetch.url}`);
      
      // Find the source info
      const sourceInfo = sources.find(s => s.source === fetch.source);
      if (!sourceInfo) {
        console.log(`  No source info found for ${fetch.source}, skipping.`);
        return;
      }
      
      // Read HTML file
      const htmlPath = path.join(__dirname, 'html_dumps', fetch.file);
      const html = fs.readFileSync(htmlPath, 'utf8');
      
      // Extract events
      const events = extractEvents(html, sourceInfo, fetch.url);
      console.log(`  Extracted ${events.length} events from ${fetch.source}`);
      
      // Add to all events
      allEvents.push(...events);
    } catch (error) {
      console.error(`Error processing ${fetch.source}: ${error.message}`);
    }
  });
  
  // For now, let's just include all events without filtering
  // We're focusing on successfully extracting data from multiple sources first
  const todaysEvents = allEvents;
  
  // This will be the filter for actual today's events
  // Keeping for future reference
  /*
  const todaysEventsFiltered = allEvents.filter(event => {
    if (event.is_today) {
      return true;
    }
    
    if (event.date) {
      const lowerDate = event.date.toLowerCase();
      
      // Check for today's date patterns
      if (lowerDate.includes(todayDate.toString()) || 
          lowerDate.includes('today') || 
          lowerDate.includes('tonight')) {
        return true;
      }
      
      // Try to match month names
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                          'july', 'august', 'september', 'october', 'november', 'december'];
      const shortMonthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      
      // Check for today's month and date
      if ((lowerDate.includes(monthNames[todayMonth - 1]) || lowerDate.includes(shortMonthNames[todayMonth - 1])) &&
          lowerDate.includes(todayDate.toString())) {
        return true;
      }
    }
    
    return false;
  });
  */
  
  // Save all events to JSON
  fs.writeFileSync(
    path.join(outputDir, 'all_events.json'), 
    JSON.stringify(allEvents, null, 2)
  );
  
  // Save today's events to JSON
  fs.writeFileSync(
    path.join(outputDir, `events_${todayString}.json`), 
    JSON.stringify(todaysEvents, null, 2)
  );
  
  // Generate markdown report for events
  let markdown = `# Live Music Events in SF Bay Area\n\n`;
  
  // Group events by venue
  const eventsByVenue = {};
  todaysEvents.forEach(event => {
    const venue = event.venue || 'Unknown Venue';
    if (!eventsByVenue[venue]) {
      eventsByVenue[venue] = [];
    }
    eventsByVenue[venue].push(event);
  });
  
  // Add events by venue
  for (const venue in eventsByVenue) {
    markdown += `## ${venue}\n\n`;
    
    eventsByVenue[venue].forEach(event => {
      markdown += `### ${event.title}\n`;
      if (event.date) markdown += `- **Date:** ${event.date}\n`;
      if (event.time) markdown += `- **Time:** ${event.time}\n`;
      if (event.url) markdown += `- **Event Link:** [Get Tickets](${event.url})\n`;
      markdown += '\n';
    });
  }
  
  // Save markdown report
  fs.writeFileSync(
    path.join(outputDir, `events_${todayString}.md`), 
    markdown
  );
  
  // Save a copy to the main directory for convenience
  fs.writeFileSync(
    path.join(__dirname, 'tonights_events.md'), 
    markdown
  );
  
  console.log(`\nProcessing complete!`);
  console.log(`- Found ${allEvents.length} total events`);
  console.log(`- Filtered ${todaysEvents.length} events for today (${todayString})`);
  console.log(`- Saved results to ${outputDir}`);
  console.log(`- Saved tonight's events to tonights_events.md`);
}

// Function to extract events from HTML using source-specific selectors
function extractEvents(html, source, sourceUrl) {
  const events = [];
  const $ = cheerio.load(html);
  
  // Special handling for JSON extraction type
  if (source.extraction_type === 'json') {
    console.log(`  Using JSON extraction method for ${source.source}`);
    
    // Handle Eventbrite specifically
    if (source.source === 'Eventbrite') {
      try {
        console.log(`  Checking for JSON data in Eventbrite HTML (length: ${html.length})`);
        
        // Look for script tags with window.__SERVER_DATA__
        const hasServerData = html.includes('window.__SERVER_DATA__');
        console.log(`  Contains window.__SERVER_DATA__: ${hasServerData}`);
        
        if (hasServerData) {
          // Extract a sample of the content
          const sampleIndex = html.indexOf('window.__SERVER_DATA__');
          const sample = html.substr(sampleIndex, 100);
          console.log(`  Sample of server data: ${sample}`);
        }
        
        // Try to find the JSON data in the script tag
        const scriptContent = html.match(/window\.__SERVER_DATA__ = ({[\s\S]*?});(?:\s*<\/script>|\s*window\.)/);
        console.log(`  Script content match found: ${!!scriptContent}`);
        
        if (scriptContent && scriptContent[1]) {
          console.log(`  Attempting to parse JSON data`);
          const jsonData = JSON.parse(scriptContent[1]);
          
          // Extract event data from the JSON
          if (jsonData.search_data && jsonData.search_data.events && jsonData.search_data.events.results) {
            const eventResults = jsonData.search_data.events.results;
            console.log(`  Found ${eventResults.length} events in JSON data for Eventbrite`);
            
            eventResults.forEach(event => {
              if (!event.name) return; // Skip if no name
              
              const title = event.name;
              const dateObj = event.start_date ? new Date(`${event.start_date}T${event.start_time || '00:00'}`) : null;
              const date = dateObj ? dateObj.toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
              }) : '';
              const time = event.start_time ? new Date(`2000-01-01T${event.start_time}`).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              }) : '';
              const url = event.url;
              
              // Check if event is today
              let isToday = false;
              if (dateObj) {
                isToday = dateObj.getDate() === todayDate && 
                          dateObj.getMonth() === todayMonth - 1 && 
                          dateObj.getFullYear() === todayYear;
              }
              
              events.push({
                title,
                date,
                time,
                url,
                venue: source.source,
                region: source.region,
                source_url: sourceUrl,
                is_today: isToday
              });
            });
            
            // If we successfully extracted events, return them
            if (events.length > 0) {
              return events;
            }
          }
        }
      } catch (error) {
        console.error(`  Error extracting JSON events from Eventbrite: ${error.message}`);
      }
    }
    
    // Handle Bandsintown specifically
    if (source.source === 'Bandsintown') {
      try {
        // Try to find JSON data
        const scriptTags = html.match(/<script[^>]*?type="application\/json"[^>]*?>(.*?)<\/script>/gs);
        if (scriptTags) {
          let foundEvents = false;
          
          for (const scriptTag of scriptTags) {
            try {
              const jsonContent = scriptTag.match(/<script[^>]*?>(.*?)<\/script>/s)[1];
              const jsonData = JSON.parse(jsonContent);
              
              // Look for events data
              if (jsonData.props && jsonData.props.pageProps && jsonData.props.pageProps.dehydratedState) {
                const dehydratedState = jsonData.props.pageProps.dehydratedState;
                
                // Extract events from various possible locations in the JSON
                const extractEventsFromQueries = (queries) => {
                  for (const query of queries) {
                    if (query.state && query.state.data) {
                      const data = query.state.data;
                      
                      // Check if this contains events
                      if (Array.isArray(data) && data.length > 0 && data[0].title) {
                        console.log(`  Found ${data.length} events in JSON data for Bandsintown`);
                        foundEvents = true;
                        
                        data.forEach(event => {
                          if (!event.title) return;
                          
                          const title = event.title || event.artist?.name || '';
                          const dateObj = event.datetime ? new Date(event.datetime) : null;
                          const date = dateObj ? dateObj.toLocaleDateString('en-US', { 
                            weekday: 'short', 
                            month: 'short', 
                            day: 'numeric' 
                          }) : event.date_description || '';
                          const time = dateObj ? dateObj.toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          }) : '';
                          const venue = event.venue?.name || '';
                          const url = event.url || '';
                          
                          // Check if event is today
                          let isToday = false;
                          if (dateObj) {
                            isToday = dateObj.getDate() === todayDate && 
                                      dateObj.getMonth() === todayMonth - 1 && 
                                      dateObj.getFullYear() === todayYear;
                          }
                          
                          events.push({
                            title,
                            date,
                            time,
                            url,
                            venue: venue || source.source,
                            region: source.region,
                            source_url: sourceUrl,
                            is_today: isToday
                          });
                        });
                      }
                    }
                  }
                };
                
                // Try to find events in different possible locations
                if (dehydratedState.queries) {
                  extractEventsFromQueries(dehydratedState.queries);
                }
                
                // If we found events, return them
                if (foundEvents) {
                  return events;
                }
              }
            } catch (e) {
              // Skip this script tag if it's not valid JSON
            }
          }
        }
      } catch (error) {
        console.error(`  Error extracting JSON events from Bandsintown: ${error.message}`);
      }
    }
    
    // Fallback to standard extraction if JSON extraction failed
    console.log(`  Falling back to standard extraction for ${source.source}`);
  }
  
  // Standard HTML extraction
  // Check if we have container selector
  if (!source.container_selector) {
    console.log(`  No container selector for ${source.source}`);
    return events;
  }
  
  // Find all event containers
  const containers = $(source.container_selector);
  console.log(`  Found ${containers.length} potential event containers for ${source.source}`);
  
  // Process each container
  containers.each(function(i) {
    // Only process the first 30 events to avoid non-event elements
    if (i >= 30) return;
    
    try {
      // Extract event details using selectors
      let title = '';
      let date = '';
      let time = '';
      let url = '';
      
      // Extract title
      if (source.title_selector) {
        title = $(this).find(source.title_selector).first().text().trim();
        // If no text directly, try getting from child a tag
        if (!title && $(this).find(source.title_selector).find('a').length) {
          title = $(this).find(source.title_selector).find('a').first().text().trim();
        }
      }
      
      // Extract date
      if (source.date_selector) {
        date = $(this).find(source.date_selector).first().text().trim();
      }
      
      // Extract time
      if (source.time_selector) {
        time = $(this).find(source.time_selector).first().text().trim();
      }
      
      // Extract URL
      if (source.url_selector) {
        const urlElement = $(this).find(source.url_selector).first();
        url = urlElement.attr('href') || '';
        
        // If URL is relative, make it absolute
        if (url && !url.startsWith('http')) {
          try {
            const baseUrl = new URL(sourceUrl);
            url = new URL(url, baseUrl).href;
          } catch (e) {
            // If URL parsing fails, just use the original
          }
        }
      }
      
      // Skip if no title or the title is too long (probably not an event)
      if (!title || title.length > 100) {
        return;
      }
      
      // Check if the event is for today based on date text
      let isToday = false;
      if (date) {
        // Convert date to lowercase for easier matching
        const lowerDate = date.toLowerCase();
        
        // Check for today keywords
        if (lowerDate.includes('today') || lowerDate.includes('tonight')) {
          isToday = true;
        }
        
        // Check for date format containing today's date (e.g., May 2)
        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                          'july', 'august', 'september', 'october', 'november', 'december'];
        const shortMonthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        
        // Try to find today's date in various formats
        if (lowerDate.includes(todayDate.toString())) {
          // Check if it also has the right month
          if ((lowerDate.includes(monthNames[todayMonth - 1]) || lowerDate.includes(shortMonthNames[todayMonth - 1]))) {
            isToday = true;
          }
          
          // If it's like "Fri May 2" format
          const dayOfWeek = today.getDay();
          const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
          if (lowerDate.includes(days[dayOfWeek])) {
            isToday = true;
          }
        }
      }
      
      // Add event to the list
      events.push({
        title,
        date,
        time,
        url,
        venue: source.source,
        region: source.region,
        source_url: sourceUrl,
        is_today: isToday
      });
    } catch (error) {
      console.error(`  Error extracting event: ${error.message}`);
    }
  });
  
  return events;
}