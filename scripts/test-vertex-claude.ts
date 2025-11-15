/**
 * Test script to verify Claude Vertex AI integration
 * Run with: npx tsx scripts/test-vertex-claude.ts
 */

import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

const projectId = process.env.GOOGLE_VERTEX_PROJECT || 'niyam-vertex-private';
const region = process.env.GOOGLE_VERTEX_LOCATION || process.env.CLOUD_ML_REGION || 'global';
const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5@20251001';

console.log('Testing Claude Vertex AI integration...');
console.log(`Project: ${projectId}`);
console.log(`Region: ${region}`);
console.log(`Model: ${model}`);
console.log('');

// Initialize client
const client = new AnthropicVertex({
  projectId,
  region,
});

async function main() {
  try {
    console.log('Sending test message...');
    const result = await client.messages.create({
      model,
      max_tokens: 500, // Increased for better test output
      messages: [
        {
          role: 'user',
          content: 'Say hello and write a short haiku about coding.',
        },
      ],
    });

    const textContent = result.content.find((c: any) => c.type === 'text') as any;
    if (textContent && textContent.text) {
      console.log('✅ Success! Claude responded:');
      console.log(textContent.text);
      console.log('');
      console.log('Full response:', JSON.stringify(result, null, 2));
    } else {
      console.error('❌ No text content in response');
      console.log('Response:', JSON.stringify(result, null, 2));
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    console.error('');
    console.error('Troubleshooting:');
    console.error('1. Ensure GOOGLE_APPLICATION_CREDENTIALS is set or gcloud auth is configured');
    console.error('2. Verify you have access to Claude models in Vertex AI Model Garden');
    console.error('3. Check that Vertex AI API is enabled');
    process.exit(1);
  }
}

main();

