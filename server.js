#!/usr/bin/env node

// Server onfiguration params
const port = 80;

const express     = require('express');
const bodyParser  = require('body-parser');
const session     = require('express-session');
const _           = require('underscore');
const querystring = require('querystring');
const https       = require('https');
const crypto      = require('cryptp');
const app         = express();

// Set up handlebars as the view engine
const exphbs = require('express-handlebars');
app.engine('handlebars', exphbs({ defaultLayout: 'main' }));
app.set('view engine', 'handlebars');

// Keeps track of the current state of the app
var server_state = {};

////////////////////////////
// BASIC MIDDLEWARE STUFF //
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

////////////////////////////////
// LINKEDIN MIDDLE WARE STUFF //
////////////////////////////////

// From the LinkedIn API docs for OAuth 2
// https://developer.linkedin.com/docs/oauth2
// This is the application that has been set up in LinkedIn

const client_id = '75r0sg4teeoy7e';
const client_secret = 'AXoszgsSSCVkiZzq';
const redirect_uri = 'http://ec2-52-197-31-112.ap-northeast-1.compute.amazonaws.com/oauth/linkedin';

// The state is used by OAuth 2 to improve security
var state;
crypto.randomBytes(256, (err, buffer) => {
	state = crypto.createHash('sha256').update(buffer).digest('hex');
});

// Step 2 — Request an Authorization Code
var query_params = {
	client_id: client_id,
	// scope: 'asd',
	redirect_uri: redirect_uri,
	response_type: 'code',
	state: state
};

// Redirects the user to LinkedIn to authorise this application if there is no ACCESS TOKEN
app.use((req, res, next) => {

	if(req.path != '/login' && req.path != '/oauth/linkedin') {
		// If we don't have an auth token to talk to the Linkein app,
		// then get the user to authorize us on their behalf.
		if(!server_state.access_token) {
			return res.redirect('https://www.linkedin.com/oauth/v2/authorization?' + querystring.stringify(query_params));
		} else {
			// GET /v1/people/~ HTTP/1.1
			// Host: api.linkedin.com
			// Connection: Keep-Alive
			// Authorization: Bearer AQXdSP_W41_UPs5ioT_t8HESyODB4FqbkJ8LrV_5mff4gPODzOYR
			// res.setHeader('Host', 'api.linkedin.com');
			// res.setHeader('Connection', 'Keep-Alive');
			// res.setHeader('Authorization', 'Bearer ' + server_state.access_token);
		}
	}
	next();

});

app.get('/oauth/linkedin', (req, res) => {
	// http://music.richgarner.net/
	// ?code=AQQI9dbaDrUAmgLU8Sn0ljy1FC0M-_T9po7xViSwUVRXHMt1K5tPR_J2rNF3M4TQ3l73B4qkb5U8GEclAQ4PZloJFmGZ0BiS446Vrin5AjVQeUfeoBI
	// &state=fjseeoo32rv
	console.log("REQ: ", req);
	for(var i in req) {
		if(i == 'query') {
			console.log(i, req[i]);
		}
	}
	console.log("REQ.method: ", req.method);
	console.log("REQ.QUERY: ", req.query);
	if(req.query.error) {
		throw Error(req.query.error + ": " + req.query.error_description);
	}

	if(req.query.state != state) {
		throw Error("State is wrong!");
	}

	if(!req.query.code) {
		throw Error("There is no AUTH CODE!");
	}

	// Step 3 — Exchange Authorization Code for an Access Token
	var options = {
		hostname: 'www.linkedin.com',
		port: 443,
		path: '/oauth/v2/accessToken',
		method: 'POST'
		// headers: {

		// }
	};
	// linkedin.aquireAccessToken((err, token) => {
	// 		console.log(token);
	// 	 	res.redirect('/');
	// })
	var access_token_request = https.request(options, (access_token_response) => {
		console.log('statusCode: ', access_token_response.statusCode);
		console.log('headers: ', access_token_response.headers);
		var data = '';
		access_token_response.on('data', (chunk) => {
			data += chunk;
			console.log(chunk);
		});
		access_token_response.on('end', () => {
			console.log('Response is done');
			var json = JSON.parse(data);
			console.log(json);
			console.log("ACCESS TOKEN", json.access_token);
			console.log("...expires in", json.expires_in);
			server_state.access_token = json.access_token;
			server_state.expires_in = json.expires_in;
			res.redirect('/');
		})
	});

	access_token_request.setHeader('Content-Type', 'application/x-www-form-urlencoded');
	access_token_request.setHeader('Host', 'www.linkedin.com');
	access_token_request.setHeader('User-Agent', 'curl/7.43.0');
	access_token_request.setHeader('Accept', '*/*');

	access_token_request.on('error', (e) => {
		console.error(e.message);
	})

	console.log("About to POST for access_token");
	var url_encode_body = querystring.stringify({
		grant_type: 'authorization_code',
		code: req.query.code,
		redirect_uri: redirect_uri,
		client_id: client_id,
		client_secret: client_secret,
	})
	console.log("URL_ENCOIDE_BODY: ", url_encode_body);
	access_token_request.write(url_encode_body);
	access_token_request.end();

});

// TODO: Use HTTPS!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

app.get('/', (req, res) => {
	var sess = req.session;
	console.log("AUTH TOKEN = ", server_state.access_token)
	res.render('messenger', {
		message: 'You are already logged in: '+ sess.username + ', ' + sess.password
	});
});

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

app.get('/login', function(req, res) {
	// render the login page
	res.render('login');
});

app.post('/login', function(req, res) {

	// set the username and password on the session
	var sess = req.session;
	sess.username = req.body.username;
	sess.password = req.body.password;

	// redirect to the home page now we're logged in
	res.redirect('/');
});

app.listen(port, function() {
	console.log('listening on port port');
});