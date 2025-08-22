
const { VertexAI } = require('@google-cloud/vertexai');

async function main() {
  const vertexAi = new VertexAI({ project: 'shravya-foundation', location: 'us-central1' });
  
  try {
    const generativeModel = vertexAi.preview.getGenerativeModel({ model: 'gemini-1.5-flash-001' });
    console.log("Successfully retrieved model: gemini-1.5-flash-001");
  } catch (err) {
    console.error("Error retrieving model: gemini-1.5-flash-001");
    console.error(err);
  }

  try {
    const generativeModel = vertexAi.preview.getGenerativeModel({ model: 'gemini-1.5-pro-001' });
    console.log("Successfully retrieved model: gemini-1.5-pro-001");
  } catch (err) {
    console.error("Error retrieving model: gemini-1.5-pro-001");
    console.error(err);
  }
}

main();
