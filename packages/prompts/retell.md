# Retell Python SDK

The Retell Python SDK (version 5.25.1) provides a comprehensive Python interface for building voice AI agents using the Retell REST API. This library enables developers to create, manage, and deploy conversational AI agents that can handle both inbound and outbound phone calls, as well as web-based voice interactions. The SDK offers both synchronous (`Retell`) and asynchronous (`AsyncRetell`) clients powered by httpx, with full type definitions for all request parameters and response fields, ensuring excellent IDE support and type safety throughout the development process.

The SDK is designed for Python 3.9+ applications and covers the complete Retell API surface, including agent management, call handling, LLM response engines, phone number provisioning, voice cloning, and knowledge base operations. It features automatic retry logic, configurable timeouts, webhook signature verification for secure integrations, and supports multiple LLM providers including GPT-4.1/5.x, Claude 4.5/4.6, and Gemini 2.5/3.0. The library follows a resource-based architecture where each API domain (agents, calls, LLMs, etc.) is accessible through dedicated resource objects on the client.

## Installation

```python
# Install from PyPI
pip install retell-sdk

# Optional: Install with aiohttp support for improved async performance
pip install retell-sdk[aiohttp]
```

## Client Initialization

### Synchronous Client

```python
import os
from retell import Retell

client = Retell(
    api_key=os.environ.get("RETELL_API_KEY"),  # Can also be omitted if env var is set
)
```

### Asynchronous Client

```python
import os
import asyncio
from retell import AsyncRetell

client = AsyncRetell(
    api_key=os.environ.get("RETELL_API_KEY"),
)

async def main():
    # Use await with all API calls
    agent = await client.agent.create(
        response_engine={"llm_id": "llm_123", "type": "retell-llm"},
        voice_id="retell-Cimo",
    )
    print(agent.agent_id)

asyncio.run(main())
```

---

## Agent Resource

The Agent resource manages voice AI agents that handle conversations.

### Create Agent

```python
agent = client.agent.create(
    response_engine={
        "llm_id": "llm_234sdertfsdsfsdf",
        "type": "retell-llm",
    },
    voice_id="retell-Cimo",
    agent_name="Customer Support Agent",
    language="en-US",
    ambient_sound="coffee-shop",
    enable_backchannel=True,
    interruption_sensitivity=0.8,
    responsiveness=1.0,
    voice_speed=1.0,
    voice_temperature=1.0,
    webhook_url="https://your-webhook.com/events",
)
print(agent.agent_id)
```

### Retrieve Agent

```python
agent = client.agent.retrieve("agent_abc123")
print(f"Agent: {agent.agent_name}, Voice: {agent.voice_id}")
```

### Update Agent

```python
updated_agent = client.agent.update(
    "agent_abc123",
    agent_name="Updated Support Agent",
    voice_speed=1.2,
    enable_dynamic_voice_speed=True,
)
```

### List Agents

```python
agents_response = client.agent.list(limit=100)
for agent in agents_response:
    print(f"{agent.agent_id}: {agent.agent_name}")
```

### Delete Agent

```python
client.agent.delete("agent_abc123")
```

### Get Agent Versions

```python
versions = client.agent.get_versions("agent_abc123")
for version in versions:
    print(f"Version {version.version}: {version.version_description}")
```

### Publish Agent

```python
client.agent.publish("agent_abc123")
```

---

## Call Resource

The Call resource manages phone calls and web calls.

### Create Phone Call (Outbound)

```python
phone_call = client.call.create_phone_call(
    from_number="+14155551234",  # Your Retell number (E.164 format)
    to_number="+14155555678",    # Destination number (E.164 format)
    override_agent_id="agent_abc123",
    metadata={"customer_id": "cust_123", "campaign": "outreach"},
    retell_llm_dynamic_variables={
        "customer_name": "John Smith",
        "account_balance": "$150.00",
    },
)
print(f"Call ID: {phone_call.call_id}")
```

### Create Web Call

```python
web_call = client.call.create_web_call(
    agent_id="agent_abc123",
    agent_version=1,
    metadata={"session_id": "web_session_123"},
    retell_llm_dynamic_variables={
        "user_name": "Jane Doe",
    },
)
print(f"Access Token: {web_call.access_token}")
```

### Register Phone Call (Custom Telephony)

```python
registered_call = client.call.register_phone_call(
    agent_id="agent_abc123",
    direction="inbound",
    from_number="+14155551234",
    to_number="+14155555678",
    metadata={"source": "custom_pbx"},
)
```

### Retrieve Call

```python
call = client.call.retrieve("call_abc123")
print(f"Status: {call.call_status}, Duration: {call.end_timestamp - call.start_timestamp}ms")
```

### Update Call

```python
updated_call = client.call.update(
    "call_abc123",
    metadata={"outcome": "successful"},
    data_storage_setting="everything_except_pii",
    override_dynamic_variables={"updated_var": "new_value"},
)
```

### List Calls

```python
calls = client.call.list(
    filter_criteria={
        "agent_id": ["agent_abc123"],
        "call_status": ["ended"],
        "start_timestamp_min": 1704067200000,  # Unix timestamp in ms
    },
    limit=50,
    sort_order="descending",
)
for call in calls:
    print(f"Call {call.call_id}: {call.call_status}")
```

### Delete Call

```python
client.call.delete("call_abc123")
```

---

## LLM Resource

The LLM resource manages Retell LLM Response Engines.

### Create LLM

```python
llm = client.llm.create(
    general_prompt="You are a helpful customer service agent...",
    model="gpt-4.1",
    model_temperature=0.3,
    begin_message="Hello! How can I help you today?",
    start_speaker="agent",
    general_tools=[
        {
            "type": "end_call",
            "name": "end_call",
            "description": "End the call when the conversation is complete",
        },
        {
            "type": "transfer_call",
            "name": "transfer_to_human",
            "description": "Transfer to a human agent",
            "number": "+14155559999",
        },
    ],
    states=[
        {
            "name": "greeting",
            "state_prompt": "Greet the customer and ask how you can help.",
            "transitions": [
                {"transition_name": "to_inquiry", "description": "Customer has a question"}
            ],
        },
    ],
    starting_state="greeting",
)
print(f"LLM ID: {llm.llm_id}")
```

### Retrieve LLM

```python
llm = client.llm.retrieve("llm_abc123")
print(f"Model: {llm.model}, Temperature: {llm.model_temperature}")
```

### Update LLM

```python
updated_llm = client.llm.update(
    "llm_abc123",
    general_prompt="Updated system prompt...",
    model="claude-4.5-sonnet",
    model_temperature=0.5,
)
```

### List LLMs

```python
llms = client.llm.list(limit=100)
for llm in llms:
    print(f"{llm.llm_id}: {llm.model}")
```

### Delete LLM

```python
client.llm.delete("llm_abc123")
```

---

## Phone Number Resource

The Phone Number resource manages phone numbers for calls.

### Create (Purchase) Phone Number

```python
phone_number = client.phone_number.create(
    area_code=415,
    country_code="US",
    nickname="Main Support Line",
    inbound_agent_id="agent_abc123",
    outbound_agent_id="agent_abc123",
    number_provider="twilio",  # or "telnyx"
)
print(f"Purchased: {phone_number.phone_number}")
```

### Import Phone Number (Custom Telephony)

```python
imported_number = client.phone_number.import_(
    phone_number="+14155551234",
    termination_uri="your-sip-trunk.pstn.twilio.com",
    inbound_agent_id="agent_abc123",
    sip_trunk_auth_username="username",
    sip_trunk_auth_password="password",
)
```

### Retrieve Phone Number

```python
phone = client.phone_number.retrieve("+14155551234")
print(f"Nickname: {phone.nickname}, Inbound Agent: {phone.inbound_agent_id}")
```

### Update Phone Number

```python
updated_phone = client.phone_number.update(
    "+14155551234",
    nickname="Updated Support Line",
    inbound_agent_id="agent_xyz789",
    inbound_webhook_url="https://your-webhook.com/inbound",
)
```

### List Phone Numbers

```python
phone_numbers = client.phone_number.list()
for phone in phone_numbers:
    print(f"{phone.phone_number}: {phone.nickname}")
```

### Delete Phone Number

```python
client.phone_number.delete("+14155551234")
```

---

## Voice Resource

The Voice resource manages voice configurations and cloning.

### List Voices

```python
voices = client.voice.list()
for voice in voices:
    print(f"{voice.voice_id}: {voice.voice_name} ({voice.provider})")
```

### Retrieve Voice

```python
voice = client.voice.retrieve("voice_abc123")
print(f"Voice: {voice.voice_name}, Provider: {voice.provider}")
```

### Clone Voice

```python
cloned_voice = client.voice.clone(
    voice_name="My Custom Voice",
    voice_provider="elevenlabs",  # or "cartesia", "minimax", "fish_audio", "platform"
    files=[
        open("sample1.wav", "rb"),
        open("sample2.wav", "rb"),
    ],
)
print(f"Cloned Voice ID: {cloned_voice.voice_id}")
```

### Search Community Voices

```python
search_results = client.voice.search(
    search_query="professional female",
    voice_provider="elevenlabs",
)
for result in search_results.results:
    print(f"{result.provider_voice_id}: {result.voice_name}")
```

### Add Community Voice

```python
added_voice = client.voice.add_resource(
    provider_voice_id="external_voice_123",
    voice_name="Community Voice Name",
    voice_provider="cartesia",
)
```

---

## Knowledge Base Resource

The Knowledge Base resource manages RAG (Retrieval-Augmented Generation) knowledge bases.

### Create Knowledge Base

```python
kb = client.knowledge_base.create(
    knowledge_base_name="Product FAQ",
    knowledge_base_urls=["https://example.com/faq", "https://example.com/docs"],
    knowledge_base_files=[open("product_manual.pdf", "rb")],
    knowledge_base_texts=[
        {"title": "Return Policy", "text": "Items can be returned within 30 days..."}
    ],
    enable_auto_refresh=True,
    max_chunk_size=2000,
    min_chunk_size=400,
)
print(f"Knowledge Base ID: {kb.knowledge_base_id}")
```

### Retrieve Knowledge Base

```python
kb = client.knowledge_base.retrieve("kb_abc123")
print(f"Name: {kb.knowledge_base_name}, Status: {kb.status}")
```

### List Knowledge Bases

```python
knowledge_bases = client.knowledge_base.list()
for kb in knowledge_bases:
    print(f"{kb.knowledge_base_id}: {kb.knowledge_base_name}")
```

### Add Sources to Knowledge Base

```python
updated_kb = client.knowledge_base.add_sources(
    "kb_abc123",
    knowledge_base_urls=["https://example.com/new-page"],
    knowledge_base_files=[open("additional_docs.pdf", "rb")],
)
```

### Delete Source from Knowledge Base

```python
updated_kb = client.knowledge_base.delete_source(
    source_id="source_xyz789",
    knowledge_base_id="kb_abc123",
)
```

### Delete Knowledge Base

```python
client.knowledge_base.delete("kb_abc123")
```

---

## Webhook Signature Verification

Verify incoming webhook requests from Retell to ensure authenticity.

```python
from retell.lib.webhook_auth import verify

def handle_webhook(request):
    body = request.body.decode("utf-8")
    signature = request.headers.get("X-Retell-Signature")
    api_key = "your_api_key"

    if verify(body, api_key, signature):
        # Signature is valid, process the webhook
        event_data = json.loads(body)
        event_type = event_data.get("event")

        if event_type == "call_started":
            print(f"Call started: {event_data['call']['call_id']}")
        elif event_type == "call_ended":
            print(f"Call ended: {event_data['call']['call_id']}")
        elif event_type == "call_analyzed":
            print(f"Analysis complete: {event_data['call']['call_id']}")
    else:
        # Invalid signature - reject the request
        return {"error": "Invalid signature"}, 401
```

---

## Error Handling

```python
import retell
from retell import Retell

client = Retell()

try:
    agent = client.agent.create(
        response_engine={"llm_id": "llm_123", "type": "retell-llm"},
        voice_id="invalid_voice",
    )
except retell.BadRequestError as e:
    print(f"Bad request (400): {e.message}")
except retell.AuthenticationError as e:
    print(f"Authentication failed (401): {e.message}")
except retell.PermissionDeniedError as e:
    print(f"Permission denied (403): {e.message}")
except retell.NotFoundError as e:
    print(f"Not found (404): {e.message}")
except retell.RateLimitError as e:
    print(f"Rate limited (429): {e.message}")
except retell.InternalServerError as e:
    print(f"Server error (5xx): {e.message}")
except retell.APIConnectionError as e:
    print(f"Connection error: {e.__cause__}")
except retell.APIStatusError as e:
    print(f"API error {e.status_code}: {e.message}")
```

---

## Configuration Options

### Retries and Timeouts

```python
from retell import Retell
import httpx

client = Retell(
    api_key="your_api_key",
    max_retries=3,  # Default is 2
    timeout=30.0,   # Default is 60 seconds
)

# Or with fine-grained timeout control
client = Retell(
    timeout=httpx.Timeout(60.0, read=5.0, write=10.0, connect=2.0),
)

# Per-request override
agent = client.with_options(timeout=120.0, max_retries=5).agent.create(
    response_engine={"llm_id": "llm_123", "type": "retell-llm"},
    voice_id="retell-Cimo",
)
```

### Accessing Raw Responses

```python
response = client.agent.with_raw_response.create(
    response_engine={"llm_id": "llm_123", "type": "retell-llm"},
    voice_id="retell-Cimo",
)
print(response.headers.get("X-Request-ID"))
agent = response.parse()  # Get the parsed response object
```

### Streaming Responses

```python
with client.call.with_streaming_response.list() as response:
    for line in response.iter_lines():
        print(line)
```

---

## Summary

The Retell Python SDK provides a robust, type-safe interface for building production-ready voice AI applications. Its comprehensive coverage of the Retell API enables developers to manage the complete lifecycle of voice agents, from creating and configuring agents with specific voices and LLM backends, to handling calls across multiple channels, and processing conversation data through knowledge bases. The SDK's architecture, with its sync/async clients, automatic retries, and webhook verification, ensures reliable integration with enterprise applications requiring high availability.

Key capabilities include creating agents with configurable voice parameters (speed, temperature, emotion), ambient sounds, and interruption handling; managing outbound campaigns and inbound call routing with dynamic variable injection; leveraging multiple LLM providers (GPT, Claude, Gemini) with state-based conversation flows; and building RAG-powered agents using knowledge bases from URLs, files, and text. The SDK's error handling, logging, and response streaming features make it suitable for both development and production environments where monitoring and debugging are essential.


-- 

> ## Documentation Index
> Fetch the complete documentation index at: https://docs.retellai.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Conversation Flow Overview

> Learn how to build structured conversational agents using nodes and transitions for complex call scenarios

## What is a Conversation Flow Agent?

Conversation flow agents allow you to create multiple nodes to handle different scenarios in conversations. This approach provides more fine-grained control over the conversation flow compared to Single/Multi Prompt agents, enabling you to handle more complex scenarios with predictable outcomes.

### Key Benefits

* **Structured conversations**: Define exact paths and transitions
* **Predictable behavior**: Each node has specific logic and outcomes
* **Complex scenario handling**: Support for conditional branching and state management
* **Fine-tuning capabilities**: Improve performance with node-specific examples

<Frame>
  <img src="https://mintcdn.com/retellai/32uO5g9DswfoJ9j7/images/cf/overview.jpeg?fit=max&auto=format&n=32uO5g9DswfoJ9j7&q=85&s=640760021e9ae1f52da8b17b17a41ac0" alt="Conversation flow diagram showing nodes connected by edges with transition conditions" width="2450" height="1122" data-path="images/cf/overview.jpeg" />
</Frame>

## Components

* **Global Settings**: Configuration that applies to the entire conversation, including:
  * Global prompt and personality
  * Default voice and language settings
  * Agent-wide parameters and behaviors

* **Node**: The basic unit of conversation flow. Multiple node types are available:
  * Conversation nodes for dialogue without tool calling
  * Subagent nodes for dialogue with tool calling
  * Function nodes for deterministic API and tool execution
  * Logic nodes for branching
  * End nodes for call termination

* **Edge**: Connections between nodes that define transition logic:
  * Condition-based transitions
  * Default fallback paths
  * Dynamic routing based on conversation context

* **Tools / Functions**: Reusable capabilities that can be attached to subagent nodes or invoked from function nodes. Conversation nodes do not use tools / functions:
  * Custom API integrations
  * Built-in utilities (calendar, SMS, transfers)
  * External service connections

## How it Works

Every node defines a small set of logic, and the transition condition is used to determine which node to transition to. Once the condition is met when checked, the agent will transition to the next node. There are also finetune examples on nodes that can help you further improve the performance. It might take longer to set up, as you want to cover all the scenarios, but after that it's much easier to maintain and the performance is more stable and predictable.

## Quickstart

Head to the Dashboard, create a new conversation flow agent and select a pre-built template to get started. You can view all options available to the agent within the Dashboard, with details of the options and any latency implications listed there. You can also view the estimated latency and cost of the agent. Modify the template to your needs, all changes are auto-saved.

## Pricing

Since the choice of model can be overridden within individual nodes, the pricing for each call is calculated based on:

* Time spent in each node (seconds)
* Model price per second for that specific node
* Total aggregated across all nodes visited during the call

This allows you to optimize costs by using different models for different parts of the conversation (e.g., cheaper models for simple routing, premium models for complex interactions).



https://docs.retellai.com/build/conversation-flow/flex-mode