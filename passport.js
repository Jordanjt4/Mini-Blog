const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// Express app setup
const app = express();
const PORT = 3000;

// Use environment variables for client ID and client secret
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

// configure passport
passport.use(new GoogleStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: `http://localhost:${PORT}/auth/google/callback`
}, (token, tokenSecret, profile, done) => {
    return done(null, profile);
}));

// what gets stored in session
passport.serializeUser((user, done) => {
    done(null, user);
});

// use that to extract what you want and return into req.body
// it would be better to just store the userid and use that to call the database for the full object
// instead of storing the entire user
passport.deserializeUser((obj, done) => {
    done(null, obj);
});