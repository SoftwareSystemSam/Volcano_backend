var express = require('express');
var router = express.Router();
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;
const bcrypt = require('bcrypt');
const saltRounds = process.env.saltRounds;
const { authenticate, optionalAuthenticate } = require('../middleware/authorization');
const moment = require('moment');


// /* GET users listing. */
// router.get('/', function(req, res, next) {
//   res.send('respond with a resource');
// });
function checkEmailMatch(reqEmail, paramEmail) {
    try {
        // Trim and convert both emails to lowercase to ensure case-insensitive comparison
        const cleanedReqEmail = reqEmail.trim().toLowerCase();
        const cleanedParamEmail = paramEmail.trim().toLowerCase();

        // Return true if they match, false otherwise
        return cleanedReqEmail === cleanedParamEmail;
    } catch (error) {
        console.error("Error comparing emails:", error);
        // Return false if there's an error in processing (e.g., one of the emails is undefined)
        return false;
    }
}
function getEmailFromToken(token) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded.email) {
            console.error("Email field is missing in token");
            return null;  // Return null or throw an error
        }
        return decoded.email;
    } catch (error) {
        console.error("Error decoding token:", error);
        return null;
    }
}

/* GET user profile */
router.get('/:email/profile', optionalAuthenticate, async function (req, res) {
    const { email } = req.params;
    const authHeader = req.headers.authorization;
    let tokenEmail = null;

    // Extract email from token without verifying it (since it was already verified in middleware)
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            
            tokenEmail = getEmailFromToken(token);
        } catch (err) {
            console.error("Token decoding failed:", err);
        }
    }
    
    console.log("My auth header is:", authHeader );
   
     // Normalize email strings for comparison
     const normalizedTokenEmail = tokenEmail ? tokenEmail.toLowerCase().trim() : null;
     const normalizedEmail = email.toLowerCase().trim();
     console.log("My normalized email is: ", normalizedEmail);
     console.log("My normalized token email is:" , normalizedTokenEmail);
     try {
        const profile = await req.db.from('users').select("email", "firstName", "lastName", "dob", "address")
            .where({ email: normalizedEmail })
            .first();

        if (!profile) {
            return res.status(404).json({
                error: true,
                message: "User not found"
            });
        }

        // Initialize the response with basic non-sensitive data
        const response = {
            email: profile.email,
            firstName: profile.firstName,
            lastName: profile.lastName,
            dob: null, // Default to null unless specified
            address: null // Default to null unless specified
        };
        console.log("Comparing token email:", normalizedTokenEmail, "to URL email:", normalizedEmail); 
        // Add sensitive data only if the token email matches the URL email
        if (normalizedTokenEmail === normalizedEmail) {
            response.dob = profile.dob ? moment(profile.dob).format('YYYY-MM-DD') : null;
            response.address = profile.address;
        } 
        else{
            delete response.dob;
            delete response.address;
        }

        res.status(200).json(response);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: true,
            message: "Internal server error"
        });
    }
});











// PUT endpoint to update user profile
router.put('/:email/profile', authenticate, async function (req, res) {
    const { email } = req.params;
    const { firstName, lastName, dob, address } = req.body;



    // Validate request body data
    if (!firstName || !lastName || !dob || !address) {
        return res.status(400).json({
            error: true,
            message: "Request body incomplete: firstName, lastName, dob and address are required."
        });
    }


    // Validate date format (simple regex match for YYYY-MM-DD)
    if (!moment(dob, 'YYYY-MM-DD', true).isValid()) {
        return res.status(400).json({
            error: true,
            message: "Invalid input: dob must be a real date in format YYYY-MM-DD."
        });
    }
    // https://www.geeksforgeeks.org/moment-js-isafter-function/
    // Check if the date of birth is in the past
    if (moment(dob).isAfter(moment())) {
        return res.status(400).json({
            error: true,
            message: "Invalid input: dob must be a date in the past."
        });
    }

    // Validate that firstName, lastName, and address are non-empty strings
    if (typeof firstName !== 'string' || firstName.trim() === '' ||
        typeof lastName !== 'string' || lastName.trim() === '' ||
        typeof address !== 'string' || address.trim() === '') {
        return res.status(400).json({
            error: true,
            message: "Bad Request",
            message: "Request body invalid: firstName, lastName and address must be strings only."

        });
    }

    if (!checkEmailMatch(req.user.email, email)) {
        return res.status(403).json({
            error: true,
            message: "Forbidden"
        });
    }

    try {
        // Update user information in the database
        await req.db.from('users').where({ email }).update({ firstName, lastName, dob, address });
        // Assuming update is successful, return the updated user profile
        res.status(200).json({
            email,
            firstName,
            lastName,
            dob,
            address
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: true,
            message: "Internal server error"
        });
    }
});



// POST user login
router.post('/login', async function (req, res, next) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            error: true,
            message: "Request body incomplete, both email and password are required"
        });
    }

    try {
        const users = await req.db.from("users").select("*").where("email", "=", email);
        if (users.length === 0) {
            return res.status(401).json({
                error: true,
                message: "Incorrect email or password"
            });
        }

        const user = users[0];
        const match = await bcrypt.compare(password, user.hash);
        if (!match) {
            return res.status(401).json({
                error: true,
                message: "Incorrect email or password"
            });
        }

        // Passwords match, create JWT
        const expires_in = 60 * 60 * 24; // 24 hours
        const exp = Math.floor(Date.now() / 1000) + expires_in;
        const token = jwt.sign({ email, exp }, process.env.JWT_SECRET);  // Include the email in the JWT payload
        return res.status(200).json({
            token,
            token_type: "Bearer",
            expires_in
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: true,
            message: "Internal server error"
        });
    }
});


/*POST user register */
router.post('/register', async function (req, res, next) {
    const { email, password } = req.body;

    // Verify body
    if (!email || !password) {
        return res.status(400).json({
            error: true,
            message: "Request body incomplete, both email and password are required"
        });
    }

    try {
        // Determine if user already exists in table
        const users = await req.db.from("users").select("*").where("email", "=", email);
        if (users.length > 0) {
            return res.status(409).json({
                error: true,
                message: "User already exists"
            });
        }

        // Hash password
        const hash = await bcrypt.hash(password, parseInt(saltRounds));

        // Insert user into DB
        await req.db.from("users").insert({ email, hash });
        res.status(201).json({ message: "User created" });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: true,
            message: "Internal server error"
        });
    }
});

module.exports = router;
