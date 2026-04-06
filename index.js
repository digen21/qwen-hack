require("dotenv").config();
const { query } = require("@qwen-code/sdk");

/**
 * Send a system prompt and user input to Qwen, return the full response as text.
 * File read/write permissions are disabled for the current project.
 *
 * @param {string} systemPrompt - Instructions that set the model's behavior/role.
 * @param {string} userInput    - The actual user message to send.
 * @returns {Promise<string>}   - The complete assistant response as a single string.
 */
async function chat(systemPrompt, userInput) {
  console.time();
  const stream = query({
    prompt: userInput,
    options: {
      systemPrompt,
      permissionMode: "plan",
      authType: "qwen-oauth",
      // env: {
      //   OPENAI_API_KEY: "0da84693-66ca-43d4-8ac4-776c36f5f27a",
      // },
      excludeTools: [
        "read_file",
        "write_file",
        "edit",
        "apply_patch",
        "delete_file",
      ],
      stderr: (message) => {
        console.log("[CLI stderr]:", message);
      },
    },
  });

  let responseText = "";

  for await (const message of stream) {
    // if (message.type === 'assistant') {
    //   responseText += message.message.content;
    // } else
    if (message.type === "result") {
      responseText += message.result ?? "";
    }
  }
  console.timeEnd();
  return responseText;
}

const systemPrompt = `You are a travel story extractor. Extract information from the user's travel story and return it as JSON.
    
    Extract the following information and return ONLY a JSON object with these fields:
    - title: A short title for the story
    - cleaned_story: Rewrite the story with proper grammar, spelling, and remove any offensive words. Keep it respectful and well-written.
    - location_name: The main city or place visited
    - country: The country
    - duration_days: Number of days spent (as a number)
    - key_visited_places: Array of 5-6 specific places/landmarks visited (e.g., ["Fushimi Inari Shrine", "Arashiyama Bamboo Grove", "Gion District"])
    - activities: List of main activities done (as an array of strings)
    - highlights: List of memorable moments (as an array of strings)
    - food: List of food items tried (as an array of strings)
    - overall_feeling: One word describing the overall emotion

    Return ONLY the JSON object. Do not write any explanation. Do not use markdown. Start your response with {{ and end with }}. Make sure the JSON is properly formatted and can be parsed without errors.

    `;

const story = `Last month I visited Goa with my cousins and we stayed at Sea Breeze Resort near Baga Beach. The hotel was decent but room service was kinda slow. We spend most time at Calangute Beach doing parasailing and jet ski, it was super fun but little expensive. Tried seafood like prawn curry and fish thali at a local shack, taste was really good but little spicy. One evening we went to Tito's lane for nightlife, music was loud and crowd was crazy. Overall trip was chill but bit tiring also.`;

// Example usage:
chat(systemPrompt, story).then(console.log).catch(console.error);
