// src/services/emailService.js
const postmark = require('postmark');

class EmailService {
  constructor() {
    this.client = new postmark.ServerClient(process.env.POSTMARK_API_KEY);
  }

  async sendVerificationEmail(email, token) {
    const verificationUrl = `${process.env.API_URL}/auth/verify-email?token=${token}`;
    
    return this.client.sendEmail({
      From: process.env.FROM_EMAIL,
      To: email,
      Subject: 'Verify your LLMule account',
      TextBody: `Welcome to LLMule! Please verify your email by clicking: ${verificationUrl}`,
      HtmlBody: `
        <h2>Welcome to LLMule!</h2>
        <p>Please verify your email address by clicking the link below:</p>
        <a href="${verificationUrl}">Verify Email</a>
        <p>This link will expire in 24 hours.</p>
      `
    });
  }
}

module.exports = new EmailService();