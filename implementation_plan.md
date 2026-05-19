# Chatbot Frontend Implementation Plan

Build a lightweight, aesthetically pleasing chatbot frontend using vanilla HTML, CSS, and JS that integrates with the DeepSeek API.

## Proposed Changes

### Structure & Layout
#### [NEW] index.html
- Standard HTML5 boilerplate.
- Semantic structure: `<header>` for branding, `<main id="chat-container">` for the conversation, and a `<footer>` containing the input form.

### Styling
#### [NEW] style.css
- Define CSS variables for theming, focusing on a premium dark mode aesthetic.
- Use modern typography (e.g., Inter or Roboto).
- Implement a responsive flexbox layout to ensure the chat window looks good on both desktop and mobile.
- Add micro-animations (e.g., message fade-in, subtle hover effects on buttons).
- Incorporate glassmorphism effects for a sleek, modern UI.

### Logic
#### [NEW] app.js
- DOM element selection and event listeners (submit button, enter key).
- State management for the chat history.
- `fetch` implementation to communicate with the DeepSeek API endpoint.
- Error handling and loading states (e.g., a pulsing typing indicator).
- Message rendering logic to safely inject text into the chat container.

## User Review Required

> [!CAUTION]
> **API Key Security**: Storing an API key in client-side JavaScript is inherently insecure as it exposes the key to anyone inspecting the page. Is this acceptable for a purely local prototyping setup, or would you like to plan for a very minimal Node/Python backend just to proxy the requests safely?

> [!IMPORTANT]
> **Design Preferences**: The current plan leans towards a sleek dark mode with vibrant accent colors. Let me know if you have a specific color palette in mind!

## Open Questions

- What specific DeepSeek model should we target (e.g., `deepseek-chat` or `deepseek-coder`)?
- Do you want support for Markdown rendering in the chatbot's responses (using a library like `marked.js`), or just plain text?
- Do you want a "Clear Chat" or "Export Chat" feature?

## Verification Plan
### Manual Verification
- Open `index.html` in a modern web browser.
- Verify the layout is responsive and visually impressive.
- Enter a message, observe the loading state, and verify the correct response is received from the DeepSeek API and rendered in the UI.
