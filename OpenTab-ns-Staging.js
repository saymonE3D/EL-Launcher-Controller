const puppeteer = require('puppeteer');

const STREAM_URL = 'https://connector_staging_ns.eaglepixelstreaming.com/v5/demo/1c/shanjid';
const NUM_TABS = 2; // set to 20 for full test
const MONITOR_TIME = 20000; // 20 seconds
const PAGE_LOAD_TIMEOUT = 60000;

let browser = null;
let foundIds = [];

async function openTabAndGetId(tabNumber) {
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(PAGE_LOAD_TIMEOUT);
    
    let foundId = null;
    
    // Listen for console messages
    page.on('console', (msg) => {
      const message = msg.text();
      
      if (message.includes('Got streamer list')) {
        // Look for ID pattern like demo_1c_10_esrj5uv1v
        const match = message.match(/demo_1c_10_[a-zA-Z0-9]+/);
        if (match && !foundId) {
          foundId = match[0];
          console.log(`Tab ${tabNumber}: Got ID = ${foundId}`);
        }
      }
    });
    
    // Open the page
    await page.goto(STREAM_URL, { waitUntil: 'networkidle0', timeout: PAGE_LOAD_TIMEOUT });
    
    // ✅ Improved streaming check
    const isStreaming = await page.evaluate(async () => {
      function wait(ms) {
        return new Promise(r => setTimeout(r, ms));
      }

      // Wait up to 10s for the video element
      let video = null;
      const startWait = Date.now();
      while (!video && Date.now() - startWait < 10000) {
        video = document.querySelector('#streamingVideo');
        if (!video) await wait(500);
      }

      if (!video) return { streaming: false, framesDecoded: 0, reason: 'Video not found' };

      // Wait until video has enough data to play
      const startReady = Date.now();
      while (video.readyState < 2 && Date.now() - startReady < 10000) {
        await wait(500);
      }

      // Now check if playback time is progressing
      const currentTime1 = video.currentTime || 0;
      await wait(5000); // allow more time for WebRTC to pump frames
      const currentTime2 = video.currentTime || 0;

      // Get frames decoded if available
      let framesDecoded = 0;
      const statsEl = document.querySelector('#statisticsResult');
      if (statsEl) {
        const match = statsEl.innerText.match(/Frames Decoded:\s*(\d+)/i);
        if (match) framesDecoded = parseInt(match[1], 10);
      }

      return {
        streaming: currentTime2 > currentTime1,
        framesDecoded,
        reason: currentTime2 > currentTime1 ? 'Playback progressing' : 'Time not moving'
      };
    });

    console.log(`Tab ${tabNumber}: Streaming = ${isStreaming.streaming}, Frames Decoded = ${isStreaming.framesDecoded}, Reason = ${isStreaming.reason}`);
    // ✅ End of streaming check

    // Wait and monitor for original MONITOR_TIME
    await new Promise(resolve => setTimeout(resolve, MONITOR_TIME));
    
    if (foundId) {
      foundIds.push(foundId);
    } else {
      console.log(`Tab ${tabNumber}: No ID found`);
    }
    
    return foundId;
    
  } catch (error) {
    console.log(`Tab ${tabNumber}: Error = ${error.message}`);
    return null;
  }
}

async function startTesting() {
  console.log(`Opening ${NUM_TABS} tabs to get streamer IDs...`);
  
  // Open browser
  browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--autoplay-policy=no-user-gesture-required'
    ]
  });
  
  // Open tabs one by one
  for (let i = 1; i <= NUM_TABS; i++) {
    await openTabAndGetId(i);
  }
  
  // Show final results
  console.log('\n=== FINAL ID LIST ===');
  if (foundIds.length > 0) {
    foundIds.forEach((id, index) => {
      console.log(`${index + 1}. ${id}`);
    });
    console.log(`\nTotal IDs found: ${foundIds.length} out of ${NUM_TABS} tabs`);
  } else {
    console.log('No IDs found');
  }
  
  console.log('\nDone! Browser stays open. Press Ctrl+C to close.');
}

// Close browser when user presses Ctrl+C
process.on('SIGINT', async () => {
  if (browser) {
    await browser.close();
  }
  process.exit();
});

startTesting();
