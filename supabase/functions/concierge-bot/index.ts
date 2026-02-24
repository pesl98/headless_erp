import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.39.0";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name: string; last_name?: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
}

interface ToolInput {
  query?: string;
  email?: string;
  name?: string;
  sku?: string;
  customer_email?: string;
  customer_name?: string;
  items?: Array<{ sku: string; quantity: number }>;
  notes?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CONCIERGE_AGENT_ID = "76ccc6c3-93a8-4102-958f-b93f4038534a";
const MAX_HISTORY_MESSAGES = 20;
const MAX_AGENTIC_ITERATIONS = 8;
const TELEGRAM_MSG_LIMIT = 4000;

// ── Tool definitions for Claude API ──────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_products",
    description:
      "Search the product catalogue by name, SKU, or category. Returns matching products with SKU, name, price, and category.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search term: product name, SKU prefix, or category",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "lookup_customer",
    description:
      "Look up an existing customer by email or name. Returns customer tier, credit balance, and account status.",
    input_schema: {
      type: "object" as const,
      properties: {
        email: { type: "string", description: "Customer email address" },
        name: { type: "string", description: "Customer name (partial match)" },
      },
    },
  },
  {
    name: "check_inventory",
    description: "Get current stock level for a product by its SKU.",
    input_schema: {
      type: "object" as const,
      properties: {
        sku: {
          type: "string",
          description: "The product SKU (stock keeping unit)",
        },
      },
      required: ["sku"],
    },
  },
  {
    name: "get_pending_orders",
    description: "Retrieve open/pending sales orders for a customer by email.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_email: {
          type: "string",
          description: "Customer email address",
        },
      },
      required: ["customer_email"],
    },
  },
  {
    name: "submit_order_request",
    description:
      "Submit a validated order to the ERP queue. Only call this after the customer has explicitly confirmed the order summary with 'yes'. Returns success status and order reference.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_email: {
          type: "string",
          description: "Customer email address",
        },
        customer_name: {
          type: "string",
          description: "Customer full name",
        },
        items: {
          type: "array",
          description: "List of order line items",
          items: {
            type: "object",
            properties: {
              sku: { type: "string", description: "Product SKU" },
              quantity: {
                type: "integer",
                description: "Quantity to order",
              },
            },
            required: ["sku", "quantity"],
          },
        },
        notes: {
          type: "string",
          description: "Optional notes for the order",
        },
      },
      required: ["customer_email", "customer_name", "items"],
    },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a Telegram chat_id to a deterministic UUID for session_id */
function chatIdToSessionId(chatId: number): string {
  const hex = Math.abs(chatId).toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

/** Send a message to a Telegram chat */
async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string
): Promise<void> {
  const truncated =
    text.length > TELEGRAM_MSG_LIMIT
      ? text.slice(0, TELEGRAM_MSG_LIMIT - 3) + "..."
      : text;

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: truncated,
      parse_mode: undefined, // plain text only
    }),
  });
}

/** Show typing indicator */
async function sendTypingAction(
  botToken: string,
  chatId: number
): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  });
}

// ── Tool executor ─────────────────────────────────────────────────────────────

async function executeTool(
  toolName: string,
  toolInput: ToolInput,
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  try {
    switch (toolName) {
      case "search_products": {
        const q = `%${toolInput.query ?? ""}%`;
        const { data, error } = await supabase
          .from("erp_products")
          .select(
            "stock_keeping_unit, product_name, standard_sale_price, category, is_active"
          )
          .or(
            `product_name.ilike.${q},stock_keeping_unit.ilike.${q},category.ilike.${q}`
          )
          .eq("is_active", true)
          .limit(10);
        if (error) return `Error searching products: ${error.message}`;
        if (!data || data.length === 0)
          return "No products found matching that search.";
        return JSON.stringify(data);
      }

      case "lookup_customer": {
        let query = supabase
          .from("erp_customers")
          .select(
            "customer_id, customer_name, contact_email, customer_tier, maximum_credit_limit, current_balance, account_status"
          );

        if (toolInput.email) {
          query = query.eq("contact_email", toolInput.email);
        } else if (toolInput.name) {
          query = query.ilike("customer_name", `%${toolInput.name}%`);
        } else {
          return "Please provide either an email or a name to look up a customer.";
        }

        const { data, error } = await query.limit(5);
        if (error) return `Error looking up customer: ${error.message}`;
        if (!data || data.length === 0)
          return "No customer found with those details.";
        return JSON.stringify(data);
      }

      case "check_inventory": {
        const { data, error } = await supabase
          .from("erp_inventory")
          .select("quantity_on_hand, quantity_reserved, reorder_level, warehouse_id")
          .eq("stock_keeping_unit", toolInput.sku)
          .single();
        if (error) return `Product SKU not found or inventory error: ${error.message}`;
        const available =
          (data?.quantity_on_hand ?? 0) - (data?.quantity_reserved ?? 0);
        return JSON.stringify({ ...data, quantity_available: available });
      }

      case "get_pending_orders": {
        // First find customer by email
        const { data: customers } = await supabase
          .from("erp_customers")
          .select("customer_id")
          .eq("contact_email", toolInput.customer_email)
          .limit(1);

        if (!customers || customers.length === 0)
          return "No customer found with that email.";

        const { data, error } = await supabase
          .from("erp_sales_orders")
          .select(
            "sales_order_id, order_status, total_invoice_value, order_creation_date"
          )
          .eq("customer_id", customers[0].customer_id)
          .in("order_status", ["draft", "pending_review", "confirmed"])
          .order("order_creation_date", { ascending: false })
          .limit(5);

        if (error) return `Error fetching orders: ${error.message}`;
        if (!data || data.length === 0)
          return "No pending orders found for this customer.";
        return JSON.stringify(data);
      }

      case "submit_order_request": {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

        const response = await fetch(
          `${supabaseUrl}/functions/v1/inbound-order`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              customer_email: toolInput.customer_email,
              customer_name: toolInput.customer_name,
              items: toolInput.items,
              notes: toolInput.notes ?? null,
              source: "telegram_concierge",
            }),
          }
        );

        const result = await response.json();
        if (!response.ok || !result.success) {
          return JSON.stringify({
            success: false,
            error: result.error ?? "Order submission failed",
            detail: result.detail ?? null,
          });
        }
        return JSON.stringify({
          success: true,
          reference: result.reference,
          sales_order_id: result.sales_order_id,
          event_id: result.event_id,
          estimated_value: result.estimated_value,
          message: result.message,
        });
      }

      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Tool execution error: ${msg}`;
  }
}

// ── Session management ────────────────────────────────────────────────────────

async function loadHistory(
  supabase: ReturnType<typeof createClient>,
  sessionId: string
): Promise<Anthropic.MessageParam[]> {
  const { data } = await supabase
    .from("erp_agent_message_history")
    .select("role, content")
    .eq("agent_id", CONCIERGE_AGENT_ID)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(MAX_HISTORY_MESSAGES);

  if (!data || data.length === 0) return [];

  return data.map((row) => ({
    role: row.role as "user" | "assistant",
    content: row.content as string,
  }));
}

async function saveMessage(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await supabase.from("erp_agent_message_history").insert({
    agent_id: CONCIERGE_AGENT_ID,
    session_id: sessionId,
    role,
    content,
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) {
    console.error("TELEGRAM_BOT_TOKEN not set");
    return new Response("Configuration error", { status: 500 });
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    console.error("ANTHROPIC_API_KEY not set");
    return new Response("Configuration error", { status: 500 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // Only handle text messages
  const message = update.message;
  if (!message?.text) {
    return new Response("ok", { status: 200 });
  }

  const chatId = message.chat.id;
  const userText = message.text.trim();
  const sessionId = chatIdToSessionId(chatId);

  // Acknowledge immediately (Telegram expects <5s response)
  const responsePromise = new Response("ok", { status: 200 });

  // Handle /start command
  if (userText === "/start" || userText.startsWith("/start ")) {
    const firstName = message.from?.first_name ?? "there";
    await sendTelegramMessage(
      botToken,
      chatId,
      `Hello ${firstName}! I'm the Concierge Agent for our ERP system.\n\nI can help you:\n- Browse our product catalogue\n- Check stock levels\n- Place orders\n\nJust tell me what you're looking for, and I'll take care of the rest!`
    );
    return responsePromise;
  }

  // Show typing indicator
  sendTypingAction(botToken, chatId).catch(() => {});

  // Initialise clients
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  try {
    // Load conversation history
    const history = await loadHistory(supabase, sessionId);

    // Save the new user message
    await saveMessage(supabase, sessionId, "user", userText);

    // Build messages array: history + current user message
    const messages: Anthropic.MessageParam[] = [
      ...history,
      { role: "user", content: userText },
    ];

    // Get system prompt from DB
    const { data: agentRow } = await supabase
      .from("erp_agents")
      .select("system_prompt")
      .eq("agent_id", CONCIERGE_AGENT_ID)
      .single();

    const systemPrompt =
      agentRow?.system_prompt ??
      "You are the Concierge Agent for a Headless ERP system. Help users place orders.";

    // ── Agentic loop ────────────────────────────────────────────────────────
    let finalText = "";
    let iterations = 0;

    while (iterations < MAX_AGENTIC_ITERATIONS) {
      iterations++;

      const response = await anthropic.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 2048,
        thinking: { type: "adaptive" },
        system: systemPrompt,
        tools: TOOLS,
        messages,
      });

      // Check stop reason
      if (response.stop_reason === "end_turn") {
        // Extract text blocks from response
        const textBlocks = response.content.filter(
          (b) => b.type === "text"
        ) as Anthropic.TextBlock[];
        finalText = textBlocks.map((b) => b.text).join("\n").trim();
        break;
      }

      if (response.stop_reason === "tool_use") {
        // Append assistant response (including thinking + tool_use blocks)
        messages.push({ role: "assistant", content: response.content });

        // Execute all tool calls
        const toolResultContent: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === "tool_use") {
            const result = await executeTool(
              block.name,
              block.input as ToolInput,
              supabase
            );
            toolResultContent.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });
          }
        }

        // Append tool results
        messages.push({ role: "user", content: toolResultContent });
        continue;
      }

      // Unexpected stop reason
      const textBlocks = response.content.filter(
        (b) => b.type === "text"
      ) as Anthropic.TextBlock[];
      finalText = textBlocks.map((b) => b.text).join("\n").trim();
      break;
    }

    if (!finalText) {
      finalText =
        "I'm sorry, I wasn't able to process that request. Please try again.";
    }

    // Save assistant response and send to Telegram
    await saveMessage(supabase, sessionId, "assistant", finalText);
    await sendTelegramMessage(botToken, chatId, finalText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("concierge-bot error:", msg);
    await sendTelegramMessage(
      botToken,
      chatId,
      "Sorry, I encountered an error. Please try again in a moment."
    );
  }

  return responsePromise;
});
