// AtlasCloud MCP Test
import OpenAI from 'openai'
const client = new OpenAI({
  apiKey: process.env.ATLASCLOUD_API_KEY || 'demo-key',
  baseURL: 'https://api.atlascloud.ai/v1',
})

async function testAtlas() {
  const response = await client.chat.completions.create({
    model: 'owl',
    messages: [{ role: 'user', content: 'hello' }],
    max_tokens: 1024,
    temperature: 0.7,
  })
  console.log(response.choices[0].message.content)
}

testAtlas()
