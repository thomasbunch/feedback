#!/usr/bin/env node

/**
 * Test script to verify MCP protocol compliance via JSON-RPC
 * Spawns the server as a child process and sends messages to stdin
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Track test results
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function log(message) {
  console.log(message);
}

function assert(condition, testName) {
  if (condition) {
    results.passed++;
    results.tests.push({ name: testName, status: 'PASS' });
    log(`✓ ${testName}`);
  } else {
    results.failed++;
    results.tests.push({ name: testName, status: 'FAIL' });
    log(`✗ ${testName}`);
  }
}

async function runTests() {
  log('Starting MCP protocol compliance tests...\n');

  // Spawn the server
  const serverPath = join(__dirname, 'build', 'index.js');
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let responseBuffer = '';
  let messageId = 1;
  let sessionId = null;

  // Collect stdout responses
  server.stdout.on('data', (data) => {
    responseBuffer += data.toString();
  });

  // Helper to send a message and wait for response
  async function sendAndWait(message, timeout = 2000) {
    return new Promise((resolve, reject) => {
      const id = message.id;
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for response to message ${id}`));
      }, timeout);

      const checkResponse = () => {
        const lines = responseBuffer.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              if (response.id === id) {
                clearTimeout(timer);
                resolve(response);
                return;
              }
            } catch (e) {
              // Not valid JSON, continue
            }
          }
        }
        // Not found yet, check again in 50ms
        setTimeout(checkResponse, 50);
      };

      server.stdin.write(JSON.stringify(message) + '\n', (err) => {
        if (err) {
          clearTimeout(timer);
          reject(err);
        } else {
          checkResponse();
        }
      });
    });
  }

  try {
    // Test 1: Initialize handshake
    log('Test 1: Initialize handshake');
    const initMessage = {
      jsonrpc: '2.0',
      id: messageId++,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '0.1.0' }
      }
    };

    const initResponse = await sendAndWait(initMessage);
    assert(initResponse.jsonrpc === '2.0', 'Initialize response has jsonrpc 2.0');
    assert(initResponse.result?.serverInfo?.name === 'feedback', 'Server name is "feedback"');
    assert(initResponse.result?.capabilities?.tools !== undefined, 'Server supports tools capability');
    log('');

    // Send initialized notification
    server.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    }) + '\n');

    // Small delay to ensure notification is processed
    await new Promise(resolve => setTimeout(resolve, 100));

    // Test 2: tools/list
    log('Test 2: tools/list');
    const toolsListMessage = {
      jsonrpc: '2.0',
      id: messageId++,
      method: 'tools/list',
      params: {}
    };

    const toolsResponse = await sendAndWait(toolsListMessage);
    assert(toolsResponse.result?.tools !== undefined, 'tools/list returns tools array');
    assert(toolsResponse.result.tools.length === 4, 'Server has 4 tools');

    const toolNames = toolsResponse.result.tools.map(t => t.name);
    assert(toolNames.includes('get_version'), 'Has get_version tool');
    assert(toolNames.includes('create_session'), 'Has create_session tool');
    assert(toolNames.includes('list_sessions'), 'Has list_sessions tool');
    assert(toolNames.includes('end_session'), 'Has end_session tool');

    // Check each tool has required properties
    const allToolsValid = toolsResponse.result.tools.every(tool =>
      tool.name && tool.description && tool.inputSchema
    );
    assert(allToolsValid, 'All tools have name, description, and inputSchema');
    log('');

    // Test 3: get_version tool invocation
    log('Test 3: get_version tool invocation');
    const versionMessage = {
      jsonrpc: '2.0',
      id: messageId++,
      method: 'tools/call',
      params: {
        name: 'get_version',
        arguments: {}
      }
    };

    const versionResponse = await sendAndWait(versionMessage);
    assert(versionResponse.result?.content !== undefined, 'get_version returns content array');
    const versionText = versionResponse.result.content[0]?.text || '';
    assert(versionText.includes('feedback'), 'Version response includes "feedback"');
    assert(versionText.includes('0.1.0'), 'Version response includes "0.1.0"');
    log('');

    // Test 4: Session lifecycle
    log('Test 4: Session lifecycle - create');
    const createSessionMessage = {
      jsonrpc: '2.0',
      id: messageId++,
      method: 'tools/call',
      params: {
        name: 'create_session',
        arguments: {}
      }
    };

    const createResponse = await sendAndWait(createSessionMessage);
    assert(createResponse.result?.content !== undefined, 'create_session returns content');
    const createText = createResponse.result.content[0]?.text || '';
    const createData = JSON.parse(createText);
    assert(createData.sessionId !== undefined, 'Response contains sessionId');
    assert(/^[a-f0-9-]{36}$/.test(createData.sessionId), 'sessionId is valid UUID format');
    sessionId = createData.sessionId;
    log('');

    log('Test 5: Session lifecycle - list');
    const listSessionsMessage = {
      jsonrpc: '2.0',
      id: messageId++,
      method: 'tools/call',
      params: {
        name: 'list_sessions',
        arguments: {}
      }
    };

    const listResponse = await sendAndWait(listSessionsMessage);
    const listText = listResponse.result.content[0]?.text || '';
    const listData = JSON.parse(listText);
    assert(listData.count === 1, 'List shows 1 active session');
    assert(listData.sessions.includes(sessionId), 'List includes the created session ID');
    log('');

    log('Test 6: Session lifecycle - end');
    const endSessionMessage = {
      jsonrpc: '2.0',
      id: messageId++,
      method: 'tools/call',
      params: {
        name: 'end_session',
        arguments: { sessionId }
      }
    };

    const endResponse = await sendAndWait(endSessionMessage);
    const endText = endResponse.result.content[0]?.text || '';
    const endData = JSON.parse(endText);
    assert(endData.ended === true, 'Session ended successfully');
    log('');

    // Test 7: Error handling
    log('Test 7: Error handling with invalid session ID');
    const invalidEndMessage = {
      jsonrpc: '2.0',
      id: messageId++,
      method: 'tools/call',
      params: {
        name: 'end_session',
        arguments: { sessionId: 'nonexistent-id' }
      }
    };

    const errorResponse = await sendAndWait(invalidEndMessage);
    assert(errorResponse.result?.isError === true, 'Error response has isError: true');
    const errorText = errorResponse.result.content[0]?.text || '';
    assert(errorText.includes('Suggested fix'), 'Error includes "Suggested fix" section');
    log('');

    // Cleanup
    server.kill();

    // Summary
    log('\n' + '='.repeat(50));
    log('TEST SUMMARY');
    log('='.repeat(50));
    log(`Passed: ${results.passed}`);
    log(`Failed: ${results.failed}`);
    log('');

    if (results.failed > 0) {
      log('FAILED TESTS:');
      results.tests.filter(t => t.status === 'FAIL').forEach(t => {
        log(`  - ${t.name}`);
      });
      process.exit(1);
    } else {
      log('All tests passed! ✓');
      process.exit(0);
    }

  } catch (error) {
    log(`\nError during testing: ${error.message}`);
    server.kill();
    process.exit(1);
  }
}

runTests();
