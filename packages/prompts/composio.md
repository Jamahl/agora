Composio
PLATFORM

J
Project

jamahl.mcmurran_workspace_first_project


Search
⌘K
Getting Started
Playground
Toolkits
Users
Sessions
Auth Configs
Triggers
Logs
Support
Documentation
Settings
Back to Project

Search
⌘K
Project Settings
General
API Keys
Webhooks
White Labeling
Usage
Organization Settings
General
Members
Billing
Usage

J
jamahl.mcmurran@betterlabs.com.au
Getting Started
Logs
Follow the steps below to make your first tool call.

1
Select your framework
Vercel AI SDKVercel AI SDK
Claude Agents SDKClaude Agents SDK
OpenAI Agents SDKOpenAI Agents SDK
Browse all frameworks
2
Select language & mode
Language
TypeScriptTypeScript
PythonPython
Use Composio As
Native Tool
MCPMCP Server
Learn more
3
Setup your agent
Copy as Markdown
Install packages
uv
pip
poetry

uv add composio composio-openai-agents openai-agents
Set environment variables
.env


COMPOSIO_API_KEY=ak_Y4w•••••••••••••4PLy
Add agent code
agent.py

# agent.py — OpenAI Agents SDK + Composio

import asyncio
from composio import Composio
from agents import Agent, Runner
from composio_openai_agents import OpenAIAgentsProvider

composio = Composio(provider=OpenAIAgentsProvider())
user_id = "user_l3gw9"

# Create a tool router session
session = composio.create(user_id=user_id)
tools = session.tools()

# Create agent with tools
agent = Agent(
    name="Composio Assistant",
    instructions="You are a helpful assistant. Use Composio tools to execute tasks.",
    tools=tools,
)

async def main():
    result = await Runner.run(
        starting_agent=agent,
        input="Star the composiohq/composio repo on GitHub",
    )
    print(result.final_output)

asyncio.run(main())
Collapse
4
Make your first tool call
When your agent runs, you'll see real-time execution logs streamed in the panel on the right. Run your code to see your first tool call.

> waiting for your tool calls ▌
run your agent code to see execution logs
