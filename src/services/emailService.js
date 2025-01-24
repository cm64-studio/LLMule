// src/services/emailService.js
const postmark = require('postmark');

class EmailService {
  constructor() {
    this.client = new postmark.ServerClient(process.env.POSTMARK_API_KEY);
  }

  async sendWelcomeEmail(email, apiKey) {
    const welcomeHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>🚀 Welcome to LLMule!</h1>
        
        <p>Hey fellow hacker! 👋</p>
        
        <p>Welcome to the decentralized AI revolution! You're now part of a community 
        that's making AI more accessible and democratic. 🌍</p>
        
        <div style="background: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Your API Key:</strong></p>
          <p style="font-family: monospace; background: #fff; padding: 10px; border-radius: 3px; word-break: break-all;">
            ${apiKey}
          </p>
        </div>

        <p>🔐 Keep this key safe! It's your passport to the LLMule network.</p>

        <h2>💻 Developer Quick Start</h2>
        <pre style="background: #f5f5f5; padding: 15px; border-radius: 5px;">
curl -X POST https://api.llmule.com/v1/chat/completions \\
-H "Content-Type: application/json" \\
-H "Authorization: Bearer ${apiKey}" \\
-d '{
  "model": "small",
  "messages": [{"role": "user", "content": "Hello!"}]
}'</pre>

        <p>🌟 Want to contribute to the network? Run your own node and earn MULE tokens!</p>
        
        <p>Happy hacking!<br>
        The LLMule Team 🚀</p>
        
        <p style="font-size: 0.8em; color: #666;">
        P.S. Join our community on Discord for support and updates! 
        <a href="https://discord.gg/TKmrBfuj2m">Join Discord</a>
        </p>
      </div>
    `;

    const plainText = `
🚀 Welcome to LLMule!

Hey fellow hacker! 👋

Welcome to the decentralized AI revolution! You're now part of a community that's making AI more accessible and democratic.

Your API Key: ${apiKey}

🔐 Keep this key safe! It's your passport to the LLMule network.

💻 Developer Quick Start:
curl -X POST https://api.llmule.com/v1/chat/completions \\
-H "Content-Type: application/json" \\
-H "Authorization: Bearer ${apiKey}" \\
-d '{
  "model": "small",
  "messages": [{"role": "user", "content": "Hello!"}]
}'

🌟 Want to contribute to the network? Run your own node and earn MULE tokens!

Happy hacking!
The LLMule Team 🚀

P.S. Join our community on Discord for support and updates! discord.gg/TKmrBfuj2m
    `;

    return this.client.sendEmail({
      From: process.env.FROM_EMAIL,
      To: email,
      Subject: '🚀 Welcome to LLMule - Your API Key Inside!',
      TextBody: plainText,
      HtmlBody: welcomeHtml
    });
  }
}

module.exports = new EmailService();