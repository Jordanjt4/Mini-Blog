const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');

const dbFileName = 'microblog.db';

async function showDatabaseContents() {
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

    console.log('Opening database file:', dbFileName);

    // Check if the users table exists
    const usersTableExists = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='users';`);
    if (usersTableExists) {
        console.log('Users table exists.');
        const users = await db.all('SELECT * FROM users');
        if (users.length > 0) {
            console.log('Users:');
            users.forEach(user => {
                console.log(user);
            });
        } else {
            console.log('No users found.');
        }
    } else {
        console.log('Users table does not exist.');
    }

    // Check if the posts table exists
    const postsTableExists = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='posts';`);
    if (postsTableExists) {
        console.log('Posts table exists.');
        const posts = await db.all('SELECT * FROM posts');
        if (posts.length > 0) {
            console.log('Posts:');
            posts.forEach(post => {
                console.log(post);
            });
        } else {
            console.log('No posts found.');
        }
    } else {
        console.log('Posts table does not exist.');
    }

    // Check if the likes table exists
    const likesTableExists = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='likes';`);
    if (likesTableExists) {
        console.log('Likes table exists.');
        const likes = await db.all('SELECT * FROM likes');
        if (likes.length > 0) {
            console.log('Likes:');
            likes.forEach(like => {
                console.log(like);
            });
        } else {
            console.log('No likes found.');
        }
    } else {
        console.log('Likes table does not exist.');
    }

    // Check if the reactions table exists
    const reactionsTableExists = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='reactions';`);
    if (reactionsTableExists) {
        console.log('Reactions table exists.');
        const reactions = await db.all('SELECT * FROM reactions');
        if (reactions.length > 0) {
            console.log('Reactions:');
            reactions.forEach(reaction => {
                console.log(reaction);
            });
        } else {
            console.log('No reactions found.');
        }
    } else {
        console.log('Reactions table does not exist.');
    }

    await db.close();
}

module.exports = { showDatabaseContents };