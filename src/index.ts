import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

const server = new McpServer({
  name: "jokesMCP",
  description: "A server that provides jokes",
  version: "1.0.0",
  tools: [
    {
      name: "get-chuck-joke",
      description: "Get a random Chuck Norris joke",
      parameters: {},
    },
    {
      name: "get-chuck-joke-by-category",
      description: "Get a random Chuck Norris joke from a specific category",
      parameters: {
        category: {
          type: "string",
          description: "The category of Chuck Norris joke to fetch",
        },
      },
    },
    {
      name: "get-chuck-categories",
      description: "Get all available categories for Chuck Norris jokes",
      parameters: {},
    },
    {
      name: "get-dad-joke",
      description: "Get a random dad joke",
      parameters: {},
    },
    {
      name: "get-yo-mama-joke",
      description: "Get a random Yo Mama joke",
      parameters: {},
    },
  ],
});

// Chuck Norris categories cache
let chuckCategoriesCache: string[] | null = null;
let chuckCategoriesCacheTimestamp = 0;
const CHUCK_CATEGORIES_CACHE_TTL = 1000 * 60 * 10; // 10 minutes

async function getChuckCategoriesList(): Promise<string[]> {
  const now = Date.now();
  if (
    chuckCategoriesCache &&
    now - chuckCategoriesCacheTimestamp < CHUCK_CATEGORIES_CACHE_TTL
  ) {
    return chuckCategoriesCache;
  }
  const response = await fetch("https://api.chucknorris.io/jokes/categories");
  if (!response.ok) throw new Error("Failed to fetch categories");
  const data = await response.json();
  chuckCategoriesCache = data;
  chuckCategoriesCacheTimestamp = now;
  return data;
}

// Get Chuck Norris joke tool
const getChuckJoke = server.tool(
  "get-chuck-joke",
  "Get a random Chuck Norris joke",
  async () => {
    const response = await fetch("https://api.chucknorris.io/jokes/random");
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: data.value,
        },
      ],
    };
  }
);
// Get Chuck Norris joke by category tool
const getChuckJokeByCategory = server.tool(
  "get-chuck-joke-by-category",
  "Get a random Chuck Norris joke from a specific category",
  async (input: any) => {
    try {
      // Try both direct and nested access for maximum compatibility
      const category = input.category || input.parameters?.category;
      if (!category || typeof category !== 'string') {
        return {
          content: [
            {
              type: "text",
              text: "Error: Please provide a valid category.",
            },
          ],
        };
      }

      // Validate category
      const validCategories = await getChuckCategoriesList();
      if (!validCategories.includes(category)) {
        return {
          content: [
            {
              type: "text",
              text: `Error: '${category}' is not a valid category. Valid categories are: ${validCategories.join(", ")}`,
            },
          ],
        };
      }

      const response = await fetch(`https://api.chucknorris.io/jokes/random?category=${encodeURIComponent(category)}`);
      if (!response.ok) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Failed to fetch joke. Status: ${response.status}. Category might not exist.`,
            },
          ],
        };
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: data.value,
          },
        ],
      };
    } catch (error) {
      console.error('Error fetching Chuck Norris joke by category:', error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
          },
        ],
      };
    }
  }
);
// Get Chuck Norris joke categories tool
const getChuckCategories = server.tool(
  "get-chuck-categories",
  "Get all available categories for Chuck Norris jokes",
  async () => {
    const response = await fetch("https://api.chucknorris.io/jokes/categories");
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: data.join(", "),
        },
      ],
    };
  }
);

// Get Dad joke tool
const getDadJoke = server.tool(
  "get-dad-joke",
  "Get a random dad joke",
  async () => {
    const response = await fetch("https://icanhazdadjoke.com/", {
      headers: {
        Accept: "application/json",
      },
    });
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: data.joke,
        },
      ],
    };
  }
);

// Get Yo Mama joke tool
const getYoMamaJoke = server.tool(
  "get-yo-mama-joke",
  "Get a random Yo Mama joke",
  async () => {
    const response = await fetch(
      "https://www.yomama-jokes.com/api/v1/jokes/random"
    );
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: data.joke,
        },
      ],
    };
  }
);

const app = express();

// to support multiple simultaneous connections we have a lookup object from
// sessionId to transport
const transports: { [sessionId: string]: SSEServerTransport } = {};

app.get("/sse", async (req: Request, res: Response) => {
  // Get the full URI from the request
  const host = req.get("host");

  const fullUri = `https://${host}/jokes`;
  const transport = new SSEServerTransport(fullUri, res);

  transports[transport.sessionId] = transport;
  res.on("close", () => {
    delete transports[transport.sessionId];
  });
  await server.connect(transport);
});

app.post("/jokes", async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No transport found for sessionId");
  }
});

app.get("/", (_req, res) => {
  res.send("The Jokes MCP server is running!");
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
});
