#!/usr/bin/env node

// Server onfiguration params
const port = 80;

const express               = require('express');
const bodyParser            = require('body-parser');
const session               = require('express-session');
const _                     = require('underscore');
const querystring           = require('querystring');
const crypto                = require('crypto');
const LinkedinClientFactory = require('./my_modules/linkedin-client.js');

const app = express();

// Set up handlebars as the view engine
const exphbs = require('express-handlebars');
app.engine('handlebars', exphbs({ defaultLayout: 'main' }));
app.set('view engine', 'handlebars');

// Set up the Linkedin client to work with the application we've already set up
var linkedin_client = LinkedinClientFactory.create({
	client_id: '75r0sg4teeoy7e',
	client_secret: 'AXoszgsSSCVkiZzq',
	redirect_uri: 'http://ec2-52-197-31-112.ap-northeast-1.compute.amazonaws.com/oauth/linkedin',
	scope: 'r_basicprofile r_emailaddress rw_company_admin w_share'
});

////////////////////////////
// basic middleware stuff //
////////////////////////////

// The middleware to handle sessions
app.use(session({
  secret: "Remember you're a womble",
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
  // TODO: make this secure over https
  // cookie: { secure: true }
}));

// Middleware to auto parse url-encoded POST data
app.use(bodyParser.urlencoded({
  extended: true
}));

// Just log the start of the request
app.use((req, res, next) => {
	console.log("Request: " + req.path);
	next();
});

// make sure user is logged in, or redirect them to the login page
app.use((req, res, next) => {
	var sess = req.session;
	if (req.path != '/login') {
		if(sess.username && sess.password) {
			console.log("User is logged in");
		} else {
			console.log("Redirecting to login page...");
			return res.redirect('/login');
		}
	}
	next();
});

////////////////////
// Linkedin stuff //
////////////////////

// Redirects the user to LinkedIn to authorise this application if there is no ACCESS TOKEN
app.use((req, res, next) => {

	if(req.path != '/login' && req.path != '/oauth/linkedin' && linkedin_client.needsNewToken()) {
		// The state is used by OAuth 2 to improve security
		crypto.randomBytes(256, (err, buffer) => {
			// If we don't have an access token to talk to the Linkein app,
			// then get the user to authorize us on their behalf.
			var state = crypto.createHash('sha256').update(buffer).digest('hex');
			return linkedin_client.requestAuthorisation(res, state);
		});
	} else {
		next();
	}

});

// This is the resource that the Linkedin API directs the user
// back to once it's approvaed the user's authorisation to let
// this application access it's account.
app.get('/oauth/linkedin', (req, res) => {

	linkedin_client.acceptAuthCode(req, (error, auth_code) => {
		if(error) {
			throw error;
		}
		linkedin_client.requestAccessToken(auth_code, (error) => {
			res.redirect('/');
		});
	});

});

////////////////////////////////////////
// The main pages for the application //
////////////////////////////////////////

// TODO: Use HTTPS!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

// Shows the main messenger page
app.get('/', (req, res) => {
	var sess = req.session;

	linkedin_client.people((error, data) => {
		res.render('messenger', {
			message: 'DATA: '+ JSON.stringify(data)
		});
	});
});

// Handles POSTS to the main messenger page
app.post('/', (req, res) => {

	// get the POST params
	var message = req.body.message;
	var recips = req.body.recipients.split(',');

	var log = "Sending message: " + message;
	log += "...to recips: " + recips.join('; ');

	// render the params to response
	res.render('messenger', {
		message: log
	});

});

// The login page. Obvs.
app.get('/login', function(req, res) {
	// render the login page
	res.render('login');
});

// Handles login requests. Obvs.
app.post('/login', function(req, res) {

	// set the username and password on the session
	var sess = req.session;
	sess.username = req.body.username;
	sess.password = req.body.password;

	// redirect to the home page now we're logged in
	res.redirect('/');
});

// Bind the server and start listening
app.listen(port, function() {
	console.log('listening on port port');
});
