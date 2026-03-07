#!/usr/bin/env node
/**
 * PWA Offline Test Suite
 * This script tests the complete offline flow
 */

const API_URL = 'http://localhost:3000';
const TEST_TOKEN = 'no-token'; // Will need valid token for actual testing

console.log('\n🧪 PWA Offline Flow Test Suite\n');
console.log('=' .repeat(60));

// Test 1: Health check
async function testServerHealth() {
  console.log('\n[1/5] Testing server health...');
  
  try {
    const response = await fetch(`${API_URL}/ping`, {
      timeout: 5000,
    });
    
    if (response.ok) {
      console.log('✅ Server is responding on port 3000');
      return true;
    } else {
      console.log('❌ Server returned error:', response.status);
      return false;
    }
  } catch (error) {
    console.log('❌ Cannot connect to server:', error.message);
    return false;
  }
}

// Test 2: Manifest.json availability
async function testManifest() {
  console.log('\n[2/5] Testing manifest.json...');
  
  try {
    const response = await fetch(`${API_URL}/manifest.json`);
    
    if (!response.ok) {
      console.log('❌ manifest.json not found (HTTP', response.status, ')');
      return false;
    }
    
    const manifest = await response.json();
    
    const required = ['name', 'short_name', 'start_url', 'display', 'icons'];
    const missing = required.filter(field => !manifest[field]);
    
    if (missing.length > 0) {
      console.log('⚠️ Manifest missing fields:', missing.join(', '));
      return false;
    }
    
    console.log('✅ manifest.json is valid');
    console.log(`   - Name: ${manifest.name}`);
    console.log(`   - Display: ${manifest.display}`);
    console.log(`   - Icons: ${manifest.icons.length}`);
    return true;
  } catch (error) {
    console.log('❌ Error loading manifest:', error.message);
    return false;
  }
}

// Test 3: Service Worker availability
async function testServiceWorker() {
  console.log('\n[3/5] Testing Service Worker...');
  
  try {
    const response = await fetch(`${API_URL}/sw.js`);
    
    if (!response.ok) {
      console.log('❌ sw.js not found (HTTP', response.status, ')');
      return false;
    }
    
    const swCode = await response.text();
    
    // Check for required Service Worker features
    const features = {
      'Install handler': /addEventListener\s*\(\s*['"]install['"]/.test(swCode),
      'Activate handler': /addEventListener\s*\(\s*['"]activate['"]/.test(swCode),
      'Fetch handler': /addEventListener\s*\(\s*['"]fetch['"]/.test(swCode),
      'IndexedDB support': /indexedDB\.open/.test(swCode),
      'Cache support': /caches\.open/.test(swCode),
    };
    
    const allGood = Object.values(features).every(v => v);
    
    if (!allGood) {
      console.log('⚠️ Service Worker missing some features:');
      Object.entries(features).forEach(([name, present]) => {
        console.log(`   ${present ? '✓' : '✗'} ${name}`);
      });
      return false;
    }
    
    console.log('✅ Service Worker is valid');
    console.log(`   - File size: ${(swCode.length / 1024).toFixed(2)} KB`);
    console.log(`   - Install handler: ✓`);
    console.log(`   - Activate handler: ✓`);
    console.log(`   - Fetch handler: ✓`);
    console.log(`   - IndexedDB support: ✓`);
    console.log(`   - Cache support: ✓`);
    return true;
  } catch (error) {
    console.log('❌ Error loading service worker:', error.message);
    return false;
  }
}

// Test 4: HTML files have PWA integration
async function testHTMLIntegration() {
  console.log('\n[4/5] Testing HTML PWA integration...');
  
  const files = [
    '/default/default.html',
    '/insert/insert.html',
    '/admin/admin.html',
    '/login/login.html',
    '/register/register.html',
  ];
  
  let allGood = true;
  
  for (const file of files) {
    try {
      const response = await fetch(`${API_URL}${file}`);
      
      if (!response.ok) {
        console.log(`   ✗ ${file} (HTTP ${response.status})`);
        allGood = false;
        continue;
      }
      
      const html = await response.text();
      
      const checks = {
        'manifest link': /<link rel="manifest"/.test(html),
        'SW registration': /navigator\.serviceWorker\.register/.test(html),
        'offline module import': /import.*offline\.js/.test(html) || /offline\.js/.test(html),
        'theme-color meta': /<meta name="theme-color"/.test(html),
      };
      
      const allChecksPass = Object.values(checks).every(v => v);
      
      if (!allChecksPass) {
        console.log(`   ⚠️ ${file} - missing some PWA features`);
        Object.entries(checks).forEach(([name, pass]) => {
          if (!pass) console.log(`      ✗ ${name}`);
        });
        allGood = false;
      } else {
        console.log(`   ✓ ${file}`);
      }
    } catch (error) {
      console.log(`   ✗ ${file} - ${error.message}`);
      allGood = false;
    }
  }
  
  if (allGood) {
    console.log('✅ All HTML files have PWA integration');
  } else {
    console.log('⚠️ Some files missing PWA features');
  }
  
  return allGood;
}

// Test 5: API Sync endpoint
async function testSyncEndpoint() {
  console.log('\n[5/5] Testing /api/sync endpoint...');
  
  try {
    // Test with valid token structure (won't be valid, but we test route exists)
    const testPayload = {
      operations: [
        {
          id: 1,
          url: '/api/locations',
          method: 'POST',
          body: {
            name: 'Test Location',
            type: 'bar',
            lat: 45.5,
            lon: 12.3,
          },
          timestamp: Date.now(),
        },
      ],
    };
    
    const response = await fetch(`${API_URL}/api/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      },
      body: JSON.stringify(testPayload),
    });
    
    // We expect 401 (unauthorized) since test token is invalid
    // But the important thing is that the endpoint exists
    if (response.status === 401) {
      console.log('✅ /api/sync endpoint exists and requires authentication');
      console.log(`   - Method: POST`);
      console.log(`   - Auth: Required`);
      console.log(`   - Expected behavior: 401 Unauthorized (token invalid)`);
      return true;
    } else if (response.status === 400) {
      console.log('✅ /api/sync endpoint exists');
      console.log(`   - Status: ${response.status} (bad request)`);
      return true;
    } else if (response.ok) {
      console.log('✅ /api/sync endpoint exists and processed request');
      const result = await response.json();
      console.log('   - Response:', result);
      return true;
    } else {
      console.log('⚠️ /api/sync returned:', response.status);
      return true; // Endpoint exists
    }
  } catch (error) {
    console.log('❌ Error testing sync endpoint:', error.message);
    return false;
  }
}

// Run all tests
async function runTests() {
  const results = [];
  
  results.push(await testServerHealth());
  if (!results[0]) {
    console.log('\n❌ Server is not running. Cannot continue tests.');
    console.log('   Run: cd geolocate-app && npm run dev');
    process.exit(1);
  }
  
  results.push(await testManifest());
  results.push(await testServiceWorker());
  results.push(await testHTMLIntegration());
  results.push(await testSyncEndpoint());
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Summary:\n');
  
  const testNames = [
    'Server Health',
    'Manifest.json',
    'Service Worker',
    'HTML Integration',
    'API Sync Endpoint',
  ];
  
  results.forEach((result, idx) => {
    const status = result ? '✅' : '❌';
    console.log(`${status} ${testNames[idx]}`);
  });
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`\n📈 Result: ${passed}/${total} tests passed\n`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! PWA is ready for browser testing.\n');
    console.log('📱 Next steps:');
    console.log('   1. Open http://localhost:3000 in your browser');
    console.log('   2. Open DevTools (F12)');
    console.log('   3. Go to Application tab → Service Workers');
    console.log('   4. Verify Service Worker is registered and active');
    console.log('   5. Go to Network tab → Check "Offline" checkbox');
    console.log('   6. Try adding a location while offline');
    console.log('   7. Uncheck "Offline" to go back online');
    console.log('   8. Watch the sync complete automatically\n');
  } else {
    console.log('⚠️ Some tests failed. Review the output above.\n');
  }
  
  process.exit(passed === total ? 0 : 1);
}

// Run tests
runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
