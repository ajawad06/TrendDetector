const { getLivePI } = require('../live_pi');

module.exports = async (req, res) => {
  try {
    const data = await getLivePI();
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: 'Live data unavailable: ' + e.message });
  }
};
