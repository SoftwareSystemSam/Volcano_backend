const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

// Uses the middle ware function from this website -> https://www.digitalocean.com/community/tutorials/nodejs-jwt-expressjs
module.exports.authenticate = function(req, res, next) {
    
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            error: true,
            message: 'Authorization header is malformed'
        });
    }
    // Check if the authorization header is malformed (not starting with "Bearer " or missing token part)
    if (!authHeader.startsWith('Bearer ') || authHeader.split(' ').length < 2) {
        return res.status(401).json({
            error: true,
            message: 'Authorization header is malformed'
        });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({
            error: true,
            message: 'Authorization header ("Bearer token") not found'
        });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            let message = 'Invalid token'; 
            if (err.name === 'TokenExpiredError') {
                message = 'JWT token has expired';
            } else if (err.name === 'JsonWebTokenError') {
                message = 'Invalid JWT token';
            }
            return res.status(401).json({
                error: true,
                message: message
            });
        }

        req.user = user;
        next();  
    });
};

module.exports.optionalAuthenticate = function(req, res, next) {
    const authHeader = req.headers['authorization'];
    const emailFromUrl = req.params.email; // Make sure to extract the email from the URL path correctly

    // Proceed without user if no auth header
    if (!authHeader) {
        req.user = null; // No user is authenticated
        return next();
    }

    // Check if the authorization header is malformed (not starting with "Bearer " or missing token part)
    if (!authHeader.startsWith('Bearer ') || authHeader.split(' ').length < 2) {
        return res.status(401).json({
            error: true,
            message: 'Authorization header is malformed'
        });
    }

    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, async (err, decodedToken) => {  // Made async to handle db operations
        if (err) {
            let message = 'Invalid token'; 
            if (err.name === 'TokenExpiredError') {
                message = 'JWT token has expired';
            } else if (err.name === 'JsonWebTokenError') {
                message = 'Invalid JWT token';
            }
            return res.status(401).json({
                error: true,
                message: message
            });
        }

        // Check if the email from the token matches the email in the request path
        if (decodedToken.email !== emailFromUrl) {
            try {
                const user = await req.db('users').where({ email: emailFromUrl }).first();
                if (!user) {
                    return res.status(404).json({
                        error: true,
                        message: 'User not found'
                    });
                }
                req.user = user; // Attach user details fetched from DB
            } catch (error) {
                console.error('Failed to fetch user details:', error);
                return res.status(500).json({
                    error: true,
                    message: 'Error fetching user details'
                });
            }
        } else {
            // If they match, attach decoded token to request
            req.user = decodedToken;
        }
        next(); // Continue to next middleware
    });
};

module.exports.optionalAuthenticateVolcano = function(req, res, next) {
    const authHeader = req.headers['authorization'];

    // If there is no auth header, continue without user context
    if (!authHeader) {
        req.user = null;
        return next();
    }

    // Check for malformed authorization header
    if (!authHeader.startsWith('Bearer ') || authHeader.split(' ').length < 2) {
        return res.status(401).json({
            error: true,
            message: 'Authorization header is malformed'
        });
    }

    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, decodedToken) => {
        if (err) {
            let message = 'Invalid token';
            if (err.name === 'TokenExpiredError') {
                message = 'JWT token has expired';
            } else if (err.name === 'JsonWebTokenError') {
                message = 'Invalid JWT token';
            }
            return res.status(401).json({
                error: true,
                message: message
            });
        }

        // Attach user to request if token is valid
        req.user = decodedToken;
        next();
    });
};
