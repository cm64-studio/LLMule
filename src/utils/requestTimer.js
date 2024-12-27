// utils/requestTimer.js
const { TokenCalculator } = require('../config/tokenomics');

class RequestTimer {
  static requests = new Map();

  static startRequest(requestId) {
    this.requests.set(requestId, {
      startTime: process.hrtime(),
      completed: false
    });
  }

  static endRequest(requestId, tokensGenerated) {
    const request = this.requests.get(requestId);
    if (!request) return null;

    const diff = process.hrtime(request.startTime);
    const seconds = diff[0] + diff[1] / 1e9;
    const tokensPerSecond = tokensGenerated / seconds;

    this.requests.delete(requestId);

    return {
      duration_seconds: Number(seconds.toFixed(3)),
      tokens_per_second: Number(tokensPerSecond.toFixed(2))
    };
  }
}

module.exports = RequestTimer;