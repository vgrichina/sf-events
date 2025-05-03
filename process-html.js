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
        
        // Look for script tags containing structured data
        let jsonData = null;
        
        // First try: Look for SERVER_DATA
        if (html.includes('window.__SERVER_DATA__')) {
          console.log(`  Found window.__SERVER_DATA__ in HTML`);
          
          // Safer regex pattern with robust handling of large JSON objects
          const serverDataMatch = html.match(/window\.__SERVER_DATA__\s*=\s*(\{[\s\S]*?\}\});/);
          if (serverDataMatch && serverDataMatch[1]) {
            try {
              jsonData = JSON.parse(serverDataMatch[1]);
              console.log(`  Successfully parsed SERVER_DATA JSON`);
            } catch (e) {
              console.log(`  Error parsing SERVER_DATA: ${e.message}`);
            }
          }
        }
        
        // Second try: Look for inline script with type="application/ld+json"
        if (!jsonData) {
          console.log(`  Looking for application/ld+json data`);
          const jsonLdMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
          
          if (jsonLdMatches && jsonLdMatches.length > 0) {
            console.log(`  Found ${jsonLdMatches.length} ld+json blocks`);
            
            // Find one that contains "Event" type
            for (const match of jsonLdMatches) {
              try {
                const jsonContent = match.replace(/<script type="application\/ld\+json">/, '').replace(/<\/script>/, '');
                const parsedJson = JSON.parse(jsonContent);
                
                // Check if this is an Event or array of Events
                if (parsedJson && (parsedJson['@type'] === 'Event' || 
                                 (Array.isArray(parsedJson) && parsedJson.some(item => item['@type'] === 'Event')))) {
                  console.log(`  Found Event data in ld+json`);
                  jsonData = { events: parsedJson };
                  break;
                }
              } catch (e) {
                // Continue to next match
              }
            }
          }
        }
        
        // Process the JSON data if found
        if (jsonData) {
          // Handle SERVER_DATA structure
          if (jsonData.search_data && jsonData.search_data.events && jsonData.search_data.events.results) {
            const eventResults = jsonData.search_data.events.results;
            console.log(`  Found ${eventResults.length} events in SERVER_DATA`);
            
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
              const venue = event.primary_venue?.name || source.source;
              
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
                venue: venue,
                region: source.region,
                source_url: sourceUrl,
                is_today: isToday
              });
            });
          } 
          // Handle ld+json structure
          else if (jsonData.events) {
            const eventData = Array.isArray(jsonData.events) ? jsonData.events : [jsonData.events];
            console.log(`  Found ${eventData.length} events in ld+json data`);
            
            eventData.forEach(event => {
              if (!event.name) return; // Skip if no name
              
              const title = event.name;
              let dateObj = null;
              
              // Parse date from different possible formats
              if (event.startDate) {
                dateObj = new Date(event.startDate);
              } else if (event.datePublished) {
                dateObj = new Date(event.datePublished);
              }
              
              const date = dateObj ? dateObj.toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
              }) : '';
              
              const time = dateObj ? dateObj.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              }) : '';
              
              const url = event.url || event.offers?.url;
              const venue = event.location?.name || source.source;
              
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
                venue: venue,
                region: source.region,
                source_url: sourceUrl,
                is_today: isToday
              });
            });
          }
          
          // If we successfully extracted events, return them
          if (events.length > 0) {
            console.log(`  Successfully extracted ${events.length} events from Eventbrite JSON`);
            return events;
          }
        }
        
        // If we get here, we couldn't find or parse the JSON data
        console.log(`  Could not find or parse event JSON data`);
      } catch (error) {
        console.error(`  Error extracting JSON events from Eventbrite: ${error.message}`);
      }
    }
    
    // Handle Bandsintown specifically
    if (source.source === 'Bandsintown') {
      try {
        console.log(`  Searching for Bandsintown event data in HTML (length: ${html.length})`);
        
        // Multiple approaches to find event data
        let foundEvents = false;
        
        // Approach 1: Look for Next.js data in script tags
        const scriptTags = html.match(/<script[^>]*?type="application\/json"[^>]*?>([\s\S]*?)<\/script>/gs);
        if (scriptTags && scriptTags.length > 0) {
          console.log(`  Found ${scriptTags.length} JSON script tags`);
          
          for (const scriptTag of scriptTags) {
            try {
              const jsonContent = scriptTag.match(/<script[^>]*?>([\s\S]*?)<\/script>/s)[1];
              const jsonData = JSON.parse(jsonContent.trim());
              
              // Check for Next.js structure (most common for Bandsintown)
              if (jsonData.props && jsonData.props.pageProps) {
                console.log(`  Found Next.js data structure`);
                
                // Try different paths where event data might be stored
                const paths = [
                  // Direct event data in pageProps
                  jsonData.props.pageProps.events,
                  jsonData.props.pageProps.upcomingEvents,
                  // Data in dehydratedState
                  jsonData.props.pageProps.dehydratedState?.queries?.flatMap(q => q.state?.data || [])
                ];
                
                for (const path of paths) {
                  if (Array.isArray(path) && path.length > 0) {
                    console.log(`  Found potential event array with ${path.length} items`);
                    
                    // Check if this looks like event data
                    if (path[0].title || path[0].name || path[0].event_type || path[0].venue) {
                      console.log(`  Identified as event data`);
                      foundEvents = true;
                      
                      path.forEach(event => {
                        // Extract core event information
                        const title = event.title || event.name || event.artist?.name || '';
                        if (!title) return; // Skip events without titles
                        
                        // Handle various date formats
                        let dateObj = null;
                        if (event.datetime) {
                          dateObj = new Date(event.datetime);
                        } else if (event.date) {
                          dateObj = new Date(event.date);
                        } else if (event.starts_at) {
                          dateObj = new Date(event.starts_at);
                        }
                        
                        const date = dateObj ? dateObj.toLocaleDateString('en-US', { 
                          weekday: 'short', 
                          month: 'short', 
                          day: 'numeric' 
                        }) : event.date_description || '';
                        
                        const time = dateObj ? dateObj.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        }) : event.time_description || '';
                        
                        // Get venue information
                        const venue = event.venue?.name || 
                                     event.location?.name || 
                                     event.place?.name || '';
                                     
                        // Get URL
                        const url = event.url || 
                                  event.ticket_url || 
                                  event.links?.tickets || 
                                  event.links?.event || '';
                        
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
                      
                      // If we found events, stop looking
                      if (events.length > 0) {
                        console.log(`  Successfully extracted ${events.length} events from Bandsintown data`);
                        return events;
                      }
                    }
                  }
                }
              }
            } catch (e) {
              console.log(`  Error processing script tag: ${e.message}`);
              // Continue to next script tag
            }
          }
        }
        
        // Approach 2: Look for schema.org JSON-LD data
        const jsonLdTags = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
        if (!foundEvents && jsonLdTags && jsonLdTags.length > 0) {
          console.log(`  Found ${jsonLdTags.length} JSON-LD tags`);
          
          for (const tag of jsonLdTags) {
            try {
              const content = tag.replace(/<script type="application\/ld\+json">/, '')
                                .replace(/<\/script>/, '').trim();
              const data = JSON.parse(content);
              
              // Handle single event or array of events
              const eventData = data['@type'] === 'Event' ? [data] : 
                              Array.isArray(data) && data[0] && data[0]['@type'] === 'Event' ? data : null;
              
              if (eventData) {
                console.log(`  Found schema.org Event data`);
                foundEvents = true;
                
                eventData.forEach(event => {
                  if (!event.name) return;
                  
                  const title = event.name;
                  const dateObj = event.startDate ? new Date(event.startDate) : null;
                  
                  const date = dateObj ? dateObj.toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                  }) : '';
                  
                  const time = dateObj ? dateObj.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  }) : '';
                  
                  const venue = event.location?.name || '';
                  const url = event.url || (event.offers && event.offers[0]?.url) || '';
                  
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
                
                if (events.length > 0) {
                  console.log(`  Extracted ${events.length} events from schema.org data`);
                  return events;
                }
              }
            } catch (e) {
              // Continue to next tag
            }
          }
        }
        
        // No event data found, log and continue to standard parsing
        if (!foundEvents) {
          console.log(`  No event data found in JSON structures`);
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
      let venueNameFromHTML = '';
      
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
      
      // Special handling for Songkick venue information
      if (source.source === 'Songkick' && source.time_selector) {
        venueNameFromHTML = $(this).find(source.time_selector).first().text().trim();
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
      
      // Special handling for Songkick data
      if (source.source === 'Songkick') {
        events.push({
          title,
          date, // This will be the actual date now
          time: '',
          url,
          venue: venueNameFromHTML || source.source, // Use the venue name from HTML
          region: source.region,
          source_url: sourceUrl,
          is_today: isToday
        });
      } else {
        // Normal handling for other venues
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
      }
    } catch (error) {
      console.error(`  Error extracting event: ${error.message}`);
    }
  });
  
  return events;
}