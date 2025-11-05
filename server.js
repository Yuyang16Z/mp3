// Get the packages we need
var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    bodyParser = require('body-parser');

// Read .env file
require('dotenv').config();

// Create our Express application
var app = express();

// Use environment defined port or 3000
var port = process.env.PORT || 3000;

// Connect to MongoDB Atlas
if (!process.env.MONGODB_URI) {
    console.error("ERROR: MONGODB_URI not found in .env file!");
    process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ Connected to MongoDB Atlas'))
.catch(err => console.error('MongoDB connection error:', err));


// Allow CORS so backend & frontend can communicate

var allowCrossDomain = function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "POST, GET, PUT, DELETE, OPTIONS");
    next();
};
app.use(allowCrossDomain);


// Middleware setup

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


// Import API routes

app.use('/api/users', require('./routes/users'));
app.use('/api/tasks', require('./routes/tasks'));

// Optional: home or test route
app.get('/', (req, res) => {
    res.json({ message: "Welcome to APIed Piper!" });
});

// Default route for root URL
app.get('/', (req, res) => {
  res.json({
    message: "Welcome to APIed Piper!",
    endpoints: [
      "/api/users",
      "/api/tasks"
    ]
  });
});

// Start the server

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});