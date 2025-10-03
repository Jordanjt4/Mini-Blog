const express = require('express');
const expressHandlebars = require('express-handlebars');
const session = require('express-session');
const { createCanvas, loadImage} = require('canvas');
let crypto = require('crypto');
const passport = require('passport');
const sqlite3 = require('sqlite3');
const sqlite = require('sqlite');
const fs = require('fs')
const { initializeDB } = require('./populatedb');
const {showDatabaseContents} = require('./showdb')
const { passportSetup } = require('./passport.js')
let db;

require('dotenv').config()
const emojiAccessToken = process.env.EMOJI_API_KEY
const clientKey = process.env.CLIENT_ID;
const clientKeySecret = process.env.CLIENT_SECRET;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Configuration and Setup
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const app = express();
const PORT = 3000;

// set up handlebars view engine with custom helpers
app.engine(
    'handlebars',
    expressHandlebars.engine({
        helpers: {
            toLowerCase: function (str) {
                return str.toLowerCase();
            },
            ifCond: function (v1, v2, options) {
                if (v1 === v2) {
                    return options.fn(this);
                }
                return options.inverse(this);
            },
            isLoggedInAndOwner: function (postUser, options) {
                let currUser = this.user.username;
                if (postUser === currUser) {
                    return options.fn(this);
                }
                return options.inverse(this);
            },
            isLoggedInAndNotOwner: function (postUser, options) {
                let currUser = this.user ? this.user.username : null;
                if (currUser && postUser !== currUser) {
                    return options.fn(this);
                }
                return options.inverse(this);
            }
        },
    })
);

app.set('view engine', 'handlebars'); // which template engine to use when you use .render
app.set('views', './views') // templates found in ./views

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Middleware
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// every request can have a session object now
app.use(
    session({
        secret: 'oneringtorulethemall',     // Secret key to sign the session ID cookie
        resave: false,                      // Don't save session if unmodified
        saveUninitialized: false,           // Don't create session until something stored
        cookie: { secure: false },          // True if using https. Set to false for development without https
    })
);

app.use((req, res, next) => {
    res.locals.appName = 'safeHER';
    res.locals.copyrightYear = 2024;
    res.locals.postNeoType = 'Post';
    res.locals.loggedIn = req.session.loggedIn || false;
    res.locals.userId = req.session.userId || '';
    next();
});

app.use(express.static('public')); // files under "public" are static files
app.use(express.urlencoded({extended: true})); // parse  URL-encoded bodies (as sent by HTML forms)
app.use(express.json()) // Allows parsing of JSON (as sent by API clients)

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Server Activation
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// function: setting up the database
async function getDBConnection () {
    console.log("Does file exist?", fs.existsSync('microblog.db'));
    if (!fs.existsSync('microblog.db')) {
        await initializeDB();
        console.log("doing initializeDB")
    } else {
        console.log("skipping initializeDB")
    }
    await showDatabaseContents();
    db = await sqlite.open({
        filename: 'microblog.db',
        driver: sqlite3.Database
    });
    app.locals.db = db; 
    console.log('Database connection established.');
}

async function activateServer() {
    try {
        await getDBConnection();
        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`)
        })
    }
    catch (error) {
        console.log('could not establish a connection to the database');
        console.log(error);
    }
}

activateServer();

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Routes
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Home route: render home view with posts and user

app.get('/', async (req, res) => {
    // query from the ? in the url
    const sort = req.query.sort || 'recency'; // get sorting type 
    const page = parseInt(req.query.page) || 1 // get the page you're on
    const posts = await getPosts(req, sort, page);
    const user = await getCurrentUser(req) || {};
    console.log("user is", user);

    // get total number of entries in database, gets stored as an object
    const totalCount = await db.get('SELECT COUNT(*) AS count FROM posts');
    // calculate how many page numbers you should have
    const totalPages = Math.ceil(totalCount.count / 9);

    const response = {
        posts: posts,
        totalPages: totalPages,
        currentPage: page
    }

    res.render('home', { response, emojiAccessToken, user });
});

// add a new post and redirect to home
app.post('/posts', async (req, res) => {
    let newContent = req.body.content;
    let newTitle = req.body.title;
    // userid (stored in session) differs from username
    let postUser = await getCurrentUser(req);
    postUser = postUser.username;
    await addPost(newTitle, newContent, postUser);
    res.redirect('/');
});

app.post('/like/:id', isAuthenticated, async (req, res) => {
    const postID = parseInt(req.params.id);
    const currentUser = await getCurrentUser(req);

    try {
        const result = await updatePostLikes(postID, currentUser.id);
        res.json({
            status: 'success',
            action: result.action,
            likeCounter: result.likes
        });
    } catch (error) {
        res.json({
            status: 'error',
            message: error.message
        });
    }
});

app.post('/delete/:id', isAuthenticated, async (req, res) => {
    const deleteID = parseInt(req.params.id);
    post = await db.get('SELECT * FROM posts WHERE id = ?', [deleteID]);

    if (post) {
        const currentUser = await getCurrentUser(req);
        // check if current user is the owner of the post
        if (post.username.toString().toLowerCase() === currentUser.username.toString().toLowerCase()) {
            db.run('DELETE FROM posts WHERE id = ?', [deleteID]);
            res.json({ status: 'success' });
        }
    } else {
        res.status(404).json({ status: 'error', message: 'Post not found' });
    }
});

app.post('/react/:id', isAuthenticated, async (req, res) => {
    const postID = parseInt(req.params.id);
    const { emoji } = req.body;
    const currentUser = await getCurrentUser(req);

    try {
        const result = await updatePostReactions(postID, currentUser.id, emoji);
        res.json({
            status: 'success',
            action: result.action,
            reactions: result.reactions
        });
    } catch (error) {
        res.json({
            status: 'error',
            message: error.message
        });
    }
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
async function findUserById(userId) {
    // return user object if found, otherwise return undefined
    try {
        gotId = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        return gotId;
    }
    catch {
        console.log("There was an error in findUserById");
    }
}

async function getCurrentUser(req) {
    // Return the user object if the session user ID matches
    const userId = req.session.userId;
    if (userId) {
        return await findUserById(userId);
    }
    return null; // No user found in session
}

async function getPosts(req, sort = 'recency', page) {
    let posts;
    const skip = (page - 1) * 9;
    const limit = 9;

    // get all post ids sorted by "likesCount"
    if (sort === 'likes') {
        posts = await db.all(`
            SELECT posts.*, COUNT(likes.post_id) AS likesCount
            FROM posts
            LEFT JOIN likes ON posts.id = likes.post_id
            GROUP BY posts.id
            ORDER BY likesCount DESC
            LIMIT ? OFFSET ?
        `, [limit, skip]);
    } else {
        posts = await db.all(`
            SELECT * FROM posts 
            ORDER BY timestamp DESC 
            LIMIT ? OFFSET ? 
            `, [limit, skip]);
    }

    const currentUser = await getCurrentUser(req);

    if (currentUser) {
        const userLikes = await db.all('SELECT post_id FROM likes WHERE user_id = ?', [currentUser.id]);
        const likedPostIds = userLikes.map(like => like.post_id); // extracts just the post ids into an array
        posts.forEach(post => {
            post.likedByCurrentUser = likedPostIds.includes(post.id); // marks if it was liked by the current logged in user
        });
    }

    return posts;
}

async function addPost(title, content, user) {
    const newPost = {
        id: undefined,
        title: title,
        content: content, 
        username: user,
        timestamp: new Date().toISOString(),
        likes: 0
    }

    // put them into the database
    return await db.run(
        'INSERT INTO posts (title, content, username, timestamp, likes) VALUES (?, ?, ?, ?, ?)',
        [newPost.title, newPost.content, newPost.username, newPost.timestamp, newPost.likes]
    );
}

async function updatePostLikes(postID, userID) {
    const likeExists = await db.get('SELECT * FROM likes WHERE post_id = ? AND user_id = ?', [postID, userID]);
    if (!likeExists) {
        await db.run('INSERT INTO likes (user_id, post_id) VALUES (?, ?)', [userID, postID]);
        await db.run('UPDATE posts SET likes = likes + 1 WHERE id = ?', [postID]);
        // gets the number of likes the post has
        // returns json object that indicates 'liked' and the updated number of likes
        const updatedPost = await db.get('SELECT likes FROM posts WHERE id = ?', [postID]);
        return { action: 'liked', likes: updatedPost.likes };
    } else {
        // otherwise remove it because the user disliked
        await db.run('DELETE FROM likes WHERE post_id = ? AND user_id = ?', [postID, userID]);
        await db.run('UPDATE posts SET likes = likes - 1 WHERE id = ?', [postID]);
        const updatedPost = await db.get('SELECT likes FROM posts WHERE id = ?', [postID]);
        return { action: 'unliked', likes: updatedPost.likes };
    }
}

async function updatePostReactions(postID, userID, emoji) {
    const reactionExists = await db.get('SELECT * FROM reactions WHERE post_id = ? AND user_id = ? AND emoji = ?', [postID, userID, emoji]);
    if (!reactionExists) {
        await db.run('INSERT INTO reactions (post_id, user_id, emoji, timestamp) VALUES (?, ?, ?, ?)', [postID, userID, emoji, new Date().toISOString()]);
    } else {
        await db.run('DELETE FROM reactions WHERE post_id = ? AND user_id = ? AND emoji = ?', [postID, userID, emoji]);
    }

    // only look at the reactions of that certain post
    // group by the same emoji, so it counts how many of each reaction it has
    const updatedReactions = await db.all('SELECT emoji, COUNT(*) as count FROM reactions WHERE post_id = ? GROUP BY emoji', [postID]);
    return { action: reactionExists ? 'removed' : 'added', reactions: updatedReactions };
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// PROFILE
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Routes
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.get('/profile', isAuthenticated, async (req, res) => {
    renderProfile(req, res);
});

app.get('/avatar/:username', (req, res) => {
    // TODO: Serve the avatar image for the user
    handleAvatar(req, res);
});

app.post('/changeUsername', isAuthenticated, async (req, res) => {
    const { newUsername } = req.body;
    const userId = req.session.userId;
    if (!newUsername || newUsername.trim() === '') {
        return res.status(400).json({ error: 'Username cannot be empty' });
    }

    try {
        
        // user tryign to change to the same username they have currently
        const currentUser = await db.get('SELECT username FROM users WHERE id = ?', [userId]);
        if (currentUser.username === newUsername) {
            return res.status(400).json({ error: 'New username cannot be the same as the current username' });
        }

        // find if there's another user with that username
        const existingUser = await db.get('SELECT * FROM users WHERE username = ?', [newUsername]);
        if (existingUser) {
            return res.status(400).json({ error: 'Username already taken' });
        }
        
        // update the database
        await db.run('UPDATE users SET username = ? WHERE id = ?', [newUsername, userId]);

        req.session.passport.user.username = newUsername;
        res.json({ status: 'success', username: newUsername });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/deleteAccount', async (req, res) => {
    try {
        const userId = req.session.userId;
        await db.run('BEGIN TRANSACTION');

        // unlike all posts
        const userLikes = await db.all('SELECT post_id FROM likes WHERE user_id = ?', [userId]);
        for (const like of userLikes) {
             await updatePostLikes(like.post_id, userId);
         }

        // remove all reactions
        const userReactions = await db.all('SELECT post_id, emoji FROM reactions WHERE user_id = ?', [userId]);
        for (const reaction of userReactions) {
             await updatePostReactions(reaction.post_id, userId, reaction.emoji);
         }

         // delete all the posts the user has made
        const userPosts = await db.all('SELECT id FROM posts WHERE username = (SELECT username FROM users WHERE id = ?)', [userId]);
        const postIds = userPosts.map(post => post.id);

        // delete all the reactions and likes other people have made on these posts
        for (const postId of postIds) {
             const postReactions = await db.all('SELECT user_id, emoji FROM reactions WHERE post_id = ?', [postId]);
             for (const reaction of postReactions) {
                 await updatePostReactions(postId, reaction.user_id, reaction.emoji);
             }

             const postLikes = await db.all('SELECT user_id FROM likes WHERE post_id = ?', [postId]);
             for (const like of postLikes) {
                 await updatePostLikes(postId, like.user_id);
             }

             await db.run('DELETE FROM posts WHERE id = ?', [postId]);
         }
         await db.run('DELETE FROM posts WHERE id = ?', [userId]);

         // delete the user from users table
         await db.run('DELETE FROM users WHERE id = ?', [userId]);
         await db.run('COMMIT');

         req.session.destroy((err) => {
             if (err) {
                 console.error('Error destroying session:', err);
                 res.status(500).json({ status: 'error', message: 'Failed to delete account' });
             } else {
                 res.json({ status: 'success' });
             }
         });
    } catch (error) {
        await db.run('ROLLBACK'); // cancel everythign in the transaction, put it back to where it was before
        res.status(500).json({ status: 'error', message: 'Failed to delete account' });
    }
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

async function renderProfile(req, res) {
    const user = await getCurrentUser(req);
    if (user) {
        // get all of the current user's posts
        let currUser = await db.all('SELECT * FROM posts WHERE LOWER(username) = LOWER(?)', [user.username]);
        res.render('profile', { user, currUser, emojiAccessToken });
    } else {
        res.redirect('/login');
    }
}

// Function to handle avatar generation and serving
function handleAvatar(req, res) {
    // TODO: Generate and serve the user's avatar image
    const { username } = req.params;
    const avatar = generateAvatar(username.charAt(0));
    res.set('Content-Type', 'image/png');
    res.send(avatar);
}

// Function to generate an image avatar
function generateAvatar(letter, width = 100, height = 100) {
    // TODO: Generate an avatar image with a letter
    // Steps:
    // 1. Choose a color scheme based on the letter
    // 2. Create a canvas with the specified width and height
    // 3. Draw the background color
    // 4. Draw the letter in the center
    // 5. Return the avatar as a PNG buffer
    
    const colors = ['#94B9AF', '#90A583', '#9D8420', '#942911', '#593837'];
    const colorIndex = (letter.charCodeAt(0) + letter.charCodeAt(0) % colors.length) % colors.length;
    const backgroundColor = colors[colorIndex];

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.min(width, height) * 0.5}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter.toUpperCase(), width / 2, height / 2);

    const buffer = canvas.toBuffer('image/png');

    return buffer;
}


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// AUTHENTICATION AND SESSION
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Routes
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.get('/login', (req, res) => {
    res.render('loginRegister', { loginError: req.query.error });
});

// render the registration page
app.get('/registerUsername', (req, res) => {
    res.render('registerUsername', { loginError: req.query.error });
});

app.get('/google', passport.authenticate('google', {
    scope: ['profile']
})); // will redirect to callback after user gives permission

// google callback
app.get('/auth/google/callback', 
    passport.authenticate('google'), // exchange authorization code for tokens, serializeUser, deserializeUser will now return whatever is set
    async (req, res) => {
        let googleID = req.user.id;
        googleID = crypto.createHash('sha256').update(googleID).digest('hex');
        req.session.hashedGoogleID = googleID;
        // if googleid already exists in database, just go to home
        // otherwise prompt to make a new username
        let checkFirstTime = await db.get('SELECT * FROM users WHERE hashedGoogleId = ?', [googleID]);
        if (!checkFirstTime) {
            // redirect user to registration page
            res.render('registerUsername', { googleID, regError: req.query.error });
        } else {
            try {
                // log in
                const user = await loginUser(checkFirstTime.username);
                // set the session information and just redirect to home page
                req.session.loggedIn = true;
                req.session.userId = user.id;
                res.redirect('/');
            } catch (error) {
                console.error('Error logging in user:', error.message);
                res.redirect('/login?error=' + encodeURIComponent(error.message));
            }
        }
});

// register the user after they submit
app.post('/registerUsername', async (req, res) => {
    let username = req.body.username;
    let googleID = req.session.hashedGoogleID;
    try {
        const user = await registerUser(username, googleID);
        req.session.loggedIn = true;
        req.session.userId = user.id;
        res.redirect('/');
    } catch (error) {
        console.error('Error registering user:', error.message);
        res.redirect('/registerUsername?error=' + encodeURIComponent(error.message));
    }
});

// logout user
app.get('/logout', (req, res) => {
    // TODO: Logout the user
    logoutUser(req, res);
});

app.get('/googleLogout', (req, res) => {
    res.render('googleLogout');
})

app.get('/error', (req, res) => {
    res.render('error'); 
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// middleware to check if user is logged in and authenticated
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
}

// find user, used when user is just logging in
async function loginUser(username) {
    const user = await findUserByUsername(username);
    if (user) {
        return user;
    } else {
        throw new Error('User not found');
    }
}

// check if user already exists, then addUser
async function registerUser(username, googleID) {
    if (await findUserByUsername(username)) {
        throw new Error('Username already exists');
    }
    return addUser(username, googleID);
}

// Function to find a user by username
async function findUserByUsername(matchUser) {
    // return users.find(user => user.username.toLowerCase() === username.toLowerCase());
    console.log("matchUser is", matchUser);
    try {
            gotUser = await db.get('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [matchUser]);
            return gotUser;
    }
    catch {
        console.log('There was an error in findUserByUsername');
    }
}

// function to add new user 
async function addUser(username, googleID) {
    const userInfo = {
        username: username,
        avatar_url: '', // default for now
        hashedGoogleId: googleID,
        memberSince: new Date().toISOString()
    };

    try {
        let query = 'INSERT INTO users (username, hashedGoogleId, avatar_url, memberSince) VALUES (?, ?, ?, ?)'
        let newUser = await db.run(query, [userInfo.username, userInfo.hashedGoogleId, userInfo.avatar_url, userInfo.memberSince]);
        // then get the user from the database and return its info
        newUser = await db.get('SELECT * FROM users WHERE hashedGoogleId = ?', googleID);
        console.log('new user successfully added', newUser);
        return newUser; 
    } catch (error) {
        console.log('could not add newUser to the database');
        console.log(error);
    }
}

// Function to logout a user
function logoutUser(req, res) {
    // TODO: Destroy session and redirect appropriately
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            res.redirect('/error');
        } else {
            res.redirect('/googleLogout');
        }
    });
}