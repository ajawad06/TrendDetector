module.exports = (req, res) => {
  res.status(200).json({ status: 'healthy', mode: 'real-data-engine' });
};
