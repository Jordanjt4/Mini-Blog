## Mini-Blog
This blog was co-developed with Kelly Phan for ECS Web Development. Bare bones (app initialization and handlebars with no styling) were provided by the professor.

### Features
- Login and account registration (username) with Google OAuth
- Upload and delete posts, featuring the ability to add emojis into the posts with the emojis API
- React (like or emojis) to other user’s posts
- Sort and paginate posts
- Delete or change account name

### Built With
- Backend: Node.js (Express)
- API: Emoji API
- Frontend: Handlebars (with HTML/CSS/JavaScript)
- Design: D3C Club, Women Safety Team designers.

### Installation and Usage
1. Install nvm (Node Version Manager).

2. Use Node 20 to run Canvas properly (the app was originally written for Node 20)
```
nvm install 20
nvm use 20
```

3. Create a .env folder in the main environment. You must have Emoji API and Google OAuth keys.
```
EMOJI_API_KEY=your_emoji_api_key
CLIENT_ID=your_oauth_client_id
CLIENT_SECRET=your_oauth_client_secret
```

4. Run the app. 
```
npm start
```