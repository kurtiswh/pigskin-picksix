// Debug endpoint to check environment variables
module.exports = function handler(req, res) {
  try {
    return res.status(200).json({
      hasResendApiKey: !!process.env.RESEND_API_KEY,
      resendApiKeyLength: process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY.length : 0,
      hasViteResendApiKey: !!process.env.VITE_RESEND_API_KEY,
      viteResendApiKeyLength: process.env.VITE_RESEND_API_KEY ? process.env.VITE_RESEND_API_KEY.length : 0,
      nodeVersion: process.version,
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return res.status(500).json({ 
      error: 'Exception occurred',
      message: error.message
    })
  }
}