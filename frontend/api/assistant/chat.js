const path = require('path');
const { handleGroundedChat } = require('../../lib/groundedChat');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const userMessage = (req.body && req.body.message) || '';
  const result = await handleGroundedChat(userMessage, [PROJECT_ROOT]);
  res.status(200).json(result);
};
