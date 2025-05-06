/**
 * cleanup-events.js
 * 
 * Uses OpenRouter API with Claude 3.5 Haiku to clean up event data
 * This script processes the extracted events and fixes/normalizes:
 * - Date formatting
 * - Time formatting
 * - Venue names
 * - Accurate is_today flags
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Get API key from environment variable
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
  console.error('Error: OPENROUTER_API_KEY environment variable not set');
  process.exit(1);
}

// Path to the events JSON file
const todayString = new Date().toISOString().split('T')[0];
const eventsFilePath = path.join(__dirname, 'processed_data', `events_${todayString}.json`);

// Check if the events file exists
if (!fs.existsSync(eventsFilePath)) {
  console.error(`Error: Events file not found at ${eventsFilePath}`);
  console.error('Run process-html.js first to generate the events file');
  process.exit(1);
}

// Read the events data
const eventsData = JSON.parse(fs.readFileSync(eventsFilePath, 'utf8'));

console.log(`Processing ${eventsData.length} events for cleanup...`);

// Prepare the prompt for Claude
const systemPrompt = `You are a data cleaning assistant. Your task is to clean up and normalize event data for a concert listing application. 

For each event in the provided JSON array, please:

1. Normalize date format to "Day, Month DD" (e.g., "Tuesday, May 6")
2. Fix any date parsing issues (some dates may have strange spacing or formatting)
3. Normalize time format to "h:mm PM" (e.g., "8:00 PM") - extract most useful time info
4. Verify the "is_today" flag based on the date - set to true only if the event is for ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
5. Remove any unneeded spaces or formatting issues in any fields
6. Identify and merge any duplicate events (same artist at same venue on same date)

Return the cleaned JSON array with the same structure.`;

const userPrompt = `Here are the events that need cleaning. Please fix any formatting issues and verify the is_today flags:

${JSON.stringify(eventsData, null, 2)}`;

// Function to call OpenRouter API
async function callOpenRouter(systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: "anthropic/claude-3.5-haiku",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ]
    });

    const options = {
      hostname: 'openrouter.ai',
      port: 443,
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://github.com/vgrichina/sf-events',
        'X-Title': 'SF Events Cleaner'
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          resolve(parsedData);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

// Main function
async function cleanupEvents() {
  try {
    console.log('Sending data to Claude 3.5 Haiku for cleanup...');
    const response = await callOpenRouter(systemPrompt, userPrompt);
    
    if (!response.choices || !response.choices[0] || !response.choices[0].message) {
      throw new Error('Invalid response from OpenRouter API');
    }

    const content = response.choices[0].message.content;
    
    // Extract JSON from the response (it might be wrapped in markdown code blocks)
    let cleanedEvents;
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || 
                      content.match(/```\n([\s\S]*?)\n```/) ||
                      [null, content];
    
    try {
      cleanedEvents = JSON.parse(jsonMatch[1]);
    } catch (e) {
      console.error('Failed to parse JSON response');
      console.error('Raw response:', content);
      throw e;
    }
    
    // Save the cleaned events
    const cleanedFilePath = path.join(__dirname, 'processed_data', `events_${todayString}_cleaned.json`);
    fs.writeFileSync(cleanedFilePath, JSON.stringify(cleanedEvents, null, 2));
    
    // Generate markdown from cleaned events
    let markdown = `# Live Music Events in SF Bay Area for ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}\n\n`;
    
    // Group events by region and venue
    const eventsByRegion = {};
    
    cleanedEvents.forEach(event => {
      const region = event.region || 'Other Areas';
      const venue = event.venue || 'Unknown Venue';
      
      if (!eventsByRegion[region]) {
        eventsByRegion[region] = {};
      }
      
      if (!eventsByRegion[region][venue]) {
        eventsByRegion[region][venue] = [];
      }
      
      eventsByRegion[region][venue].push(event);
    });
    
    // Add events by region and venue
    for (const region in eventsByRegion) {
      markdown += `## ${region}\n\n`;
      
      for (const venue in eventsByRegion[region]) {
        markdown += `### ${venue}\n\n`;
        
        eventsByRegion[region][venue].forEach(event => {
          markdown += `#### ${event.title}\n`;
          if (event.date) markdown += `- **Date:** ${event.date}\n`;
          if (event.time) markdown += `- **Time:** ${event.time}\n`;
          if (event.url) markdown += `- **Event Link:** [Get Tickets](${event.url})\n`;
          markdown += '\n';
        });
      }
    }
    
    // Save cleaned markdown
    const markdownPath = path.join(__dirname, 'processed_data', `events_${todayString}_cleaned.md`);
    fs.writeFileSync(markdownPath, markdown);
    
    // Also save to the main tonights_events.md file
    fs.writeFileSync(path.join(__dirname, 'tonights_events.md'), markdown);
    
    console.log(`Successfully cleaned up ${cleanedEvents.length} events`);
    console.log(`Saved to: ${cleanedFilePath}`);
    console.log(`Markdown saved to: ${markdownPath} and tonights_events.md`);
    
  } catch (error) {
    console.error('Error during event cleanup:', error);
  }
}

// Run the main function
cleanupEvents();