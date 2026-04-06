require("dotenv").config();

const { query } = require("@qwen-code/sdk");
const path = require("path");
const fs = require("fs");
const winston = require("winston");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
    new winston.transports.Console(),
  ],
});

// Optional: keep file logs only for local
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.File({ filename: "error.log", level: "error" }),
  );
  logger.add(new winston.transports.File({ filename: "combined.log" }));
}

function setupQwenAuth() {
  const {
    QWEN_ACCESS_TOKEN,
    QWEN_REFRESH_TOKEN,
    QWEN_TOKEN_EXPIRY_DATE,
    QWEN_TOKEN_TYPE,
    QWEN_RESOURCE_URL,
  } = process.env;

  logger.info(`========== Building Qwen Auth ==========`);

  if (!QWEN_ACCESS_TOKEN) {
    logger.error(`QWEN_ACCESS_TOKEN not found in env. Skipping qwen setup`);
    return;
  }

  const qwenDir = path.join(__dirname, ".qwen");
  const credsFile = path.join(qwenDir, "oauth_creds.json");

  if (!fs.existsSync(qwenDir)) {
    fs.mkdirSync(qwenDir, { recursive: true });
  }

  const data = {
    access_token: QWEN_ACCESS_TOKEN,
    token_type: QWEN_TOKEN_TYPE,
    refresh_token: QWEN_REFRESH_TOKEN,
    resource_url: QWEN_RESOURCE_URL,
    expiry_date: parseInt(QWEN_TOKEN_EXPIRY_DATE),
  };

  fs.writeFileSync(credsFile, JSON.stringify(data, null, 2), "utf-8");
  logger.info(`Generated  ${credsFile} from .env`);
  logger.info(`========== Building Qwen Auth Completed ==========`);
}

/**
 * Returns env overrides that redirect the CLI to read .qwen from the project root
 * instead of the user's home directory (~/.qwen).
 */
function getProjectQwenEnv() {
  const projectRoot = process.cwd();

  return {
    // On Linux/Mac servers, HOME controls where ~/.qwen is resolved
    HOME: projectRoot,
    // On Windows, USERPROFILE is used instead
    USERPROFILE: projectRoot,
  };
}

/**
 * Send a system prompt and user input to Qwen, return the full response as text.
 * File read/write permissions are disabled for the current project.
 *
 * @param {string} systemPrompt - Instructions that set the model's behavior/role.
 * @param {string} userInput    - The actual user message to send.
 * @returns {Promise<string>}   - The complete assistant response as a single string.
 */
async function chat(systemPrompt, userInput) {
  logger.info("Starting chat request", {
    systemPromptLength: systemPrompt?.length,
    userInputLength: userInput?.length,
  });
  const startTime = Date.now();

  const stream = query({
    prompt: userInput,
    options: {
      systemPrompt,
      permissionMode: "plan",
      authType: "qwen-oauth",
      env: getProjectQwenEnv(),
      excludeTools: [
        "read_file",
        "write_file",
        "edit",
        "apply_patch",
        "delete_file",
      ],
      stderr: (message) => {
        logger.warn("CLI stderr", { message });
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
  const duration = Date.now() - startTime;
  logger.info("Chat request completed", {
    duration,
    responseLength: responseText?.length,
  });
  return responseText;
}

setupQwenAuth();

// Express Server Setup
const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.post("/api/chat", async (req, res) => {
  logger.info("Received chat request", {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });

  try {
    const { systemPrompt: prompt, userInput } = req.body;

    if (!userInput) {
      logger.warn("Missing userInput in request");
      return res.status(400).json({ error: "userInput is required" });
    }

    logger.info("Calling chat function", { hasSystemPrompt: !!prompt });
    const response = await chat(prompt || "", userInput);
    logger.info("Chat response sent successfully");
    res.json({ response });
  } catch (error) {
    const projectRoot = process.cwd();
    const qwenDir = path.join(projectRoot, ".qwen");
    const credsFile = path.join(qwenDir, "oauth_creds.json");

    // Debug logs
    logger.info("Qwen Env Debug", {
      projectRoot,
      qwenDirExists: fs.existsSync(qwenDir),
      credsFileExists: fs.existsSync(credsFile),
      credsFilePath: credsFile,
    });

    logger.error("Chat error", { error: error.message, stack: error.stack });
    res.status(500).json({
      error: "Failed to process chat request",
      log: error?.message,
      info: {
        projectRoot,
        qwenDirExists: fs.existsSync(qwenDir),
        credsFileExists: fs.existsSync(credsFile),
        credsFilePath: credsFile,
      },
    });
  }
});

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});
