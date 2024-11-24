const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const cors = require('cors');
const requestIp = require('request-ip');
const macaddress = require('macaddress');

const app = express();
const port = 3000;

// Middleware setup
app.use(express.json());
app.use(cors());
app.use(requestIp.mw());

// Set up SQLite database
const db = new sqlite3.Database('./users.db', (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
  } else {
    console.log('users database connected.');
  }
});

// Create tables if they don't exist
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    mac_address TEXT NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    verified_at DATETIME
  )
`, (err) => {
  if (err) {
    console.error('Error creating codes table:', err.message);
  } else {
    console.log('Codes database connnected.');
  }
});


// Helper function to generate random code
function generateRandomCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Register endpoint
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const macAddress = req.clientIp; // For production, replace this with actual MAC retrieval
  if (!macAddress) {
    return res.status(400).json({ error: 'Unable to retrieve device information.' });
  }

  // Check if the email already exists
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, row) => {
    if (row) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new user into the database
    db.run('INSERT INTO users (email, password, mac_address) VALUES (?, ?, ?)', [email, hashedPassword, macAddress], (err) => {
      if (err) {
        console.error('Error inserting user:', err.message);
        return res.status(500).json({ error: 'Error creating user' });
      }
      res.status(201).json({ message: 'Registration successful' });
    });
  });
});
//
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, row) => {
    if (err) {
      console.error('Error fetching user:', err.message);
      return res.status(500).json({ error: 'Internal server error.' });
    }

    if (!row) {
      return res.status(400).json({ error: 'User not found.' });
    }

    const isMatch = await bcrypt.compare(password, row.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials.' });
    }

    const currentMacAddress = req.clientIp; // Replace with actual MAC retrieval
    if (email !== "admin123@gmail.com" && row.mac_address !== currentMacAddress) {
      return res.status(400).json({ error: 'This account can only be accessed from the registered device.' });
    }

    // Respond with success and user info (or token, depending on your needs)
    res.status(200).json({
      message: 'Login successful',
      email: row.email,
      userId: row.id
    });
  });
});




// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Your login route can redirect to sim.html like this:
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, row) => {
    if (err) {
      console.error('Error fetching user:', err.message);
      return res.status(500).json({ error: 'Internal server error.' });
    }

    if (!row) {
      return res.status(400).json({ error: 'User not found.' });
    }

    const isMatch = await bcrypt.compare(password, row.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials.' });
    }

    const currentMacAddress = req.clientIp; // Replace with actual MAC retrieval
    if (email !== "admin123@gmail.com" && row.mac_address !== currentMacAddress) {
      return res.status(400).json({ error: 'This account can only be accessed from the registered device.' });
    }

    // Redirect to sim.html on successful login
    res.redirect('/sim.html');
  });
});

// API to get all codes
app.get('/api/codes', (req, res) => {
  db.all('SELECT * FROM codes', (err, rows) => {
    if (err) {
      console.error('Error fetching codes:', err);
      return res.status(500).json({ error: 'Failed to retrieve codes' });
    }
    res.json(rows);
  });
});

// API to add a new code
app.post('/api/addCode', (req, res) => {
  const code = generateRandomCode();
  db.run('INSERT INTO codes (code) VALUES (?)', [code], function(err) {
    if (err) {
      console.error('Error adding code:', err);
      return res.status(500).json({ error: 'Failed to add code' });
    }
    res.status(201).json({ message: 'Code added successfully', code });
  });
});

// API to delete a code by code value
app.delete('/api/deleteCode', (req, res) => {
  const { code } = req.body;
  db.run('DELETE FROM codes WHERE code = ?', [code], function(err) {
    if (err) {
      console.error('Error deleting code:', err);
      return res.status(500).json({ error: 'Failed to delete code' });
    }
    res.json({ message: 'Code deleted successfully' });
  });
});

// API to verify code and delete it from the database
// API to verify code and delete it from the database
// API to verify code and delete it from the database
// API to verify code and delete it from the database
app.post('/api/verifyCode', (req, res) => {
  const { code } = req.body;

  db.get('SELECT * FROM codes WHERE code = ?', [code], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to retrieve code' });
    }
    if (!row) {
      return res.status(400).json({ error: 'Invalid code' });
    }

    // Update the verified_at column with the current timestamp
    const currentTimestamp = new Date().toISOString();
    db.run('UPDATE codes SET verified_at = ? WHERE code = ?', [currentTimestamp, code], function(err) {
      if (err) {
        console.error('Failed to update code verification time:', err.message);
        return res.status(500).json({ error: 'Failed to update code verification time' });
      }

      // Delete the code from the database after verification
      db.run('DELETE FROM codes WHERE code = ?', [code], function(err) {
        if (err) {
          console.error('Failed to delete code after verification:', err.message);
          return res.status(500).json({ error: 'Failed to delete code after verification' });
        }
        res.status(200).json({ message: 'Code verified and deleted successfully' });
      });
    });
  });
});

//db.run('ALTER TABLE codes ADD COLUMN verified_at DATETIME', (err) => {
 // if (err) {
 //   console.error('Error adding verified_at column:', err.message);
 // } else {
 //   console.log('verified_at column added successfully.');
 // }
//});

//
// API to check if the user needs to verify the code based on time elapsed
// API to check if the user needs to verify the code based on time elapsed
app.post('/api/checkCodeForVideo', (req, res) => {
  const { code } = req.body;

  db.get('SELECT * FROM codes WHERE code = ?', [code], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to retrieve code' });
    }
    if (!row) {
      return res.status(400).json({ error: 'Invalid code' });
    }

    // Get the current timestamp and the verification timestamp
    const currentTimestamp = new Date();
    const verificationTimestamp = new Date(row.verified_at); // This should be in UTC format

    // Calculate the time difference in milliseconds
    const diffTime = currentTimestamp - verificationTimestamp;
    const diffDays = diffTime / (1000 * 3600 * 24); // Convert milliseconds to days

    // If the verification was within the last 7 days, allow access without a code
    if (diffDays <= 7) {
      res.status(200).json({ message: 'Code verified within 7 days, no need to verify again' });
    } else {
      res.status(400).json({ error: 'Code verification expired, please verify again' });
    }
  });
});



// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
