var https       = require('https');
var querystring = require('querystring');

module.exports.create = function(options) {

	var client_id     = options.client_id;
	var client_secret = options.client_secret;
	var redirect_uri  = options.redirect_uri;
	var state         = options.state;
	var scope         = options.scope;

	return {
		_state: {},
		hasAccessToken: function() {
			return this._state.auth_token;
		},
		needsNewToken: function() {
			return !this.hasAccessToken() && (Date.now() < _state.auth_token_expiry);
		},
		requestAuthorisation: function(http_response, state) {
			return http_response.redirect(
				'https://www.linkedin.com/oauth/v2/authorization?' + querystring.stringify({
					client_id: client_id,
					scope: scope,
					redirect_uri: redirect_uri,
					response_type: 'code',
					state: state
				})
			);
		},
		acceptAuthCode: function(http_request, callback) {
			
			var error;
			if(http_request.method != 'GET') {
				error = Error('Linkedin.acceptAuthCode(http_request): http_request.method must be a GET')
			}

			if(http_request.query.error) {
				error = Error('Linkedin.acceptAuthCode(http_request): ' + http_request.query.error + ": " + http_request.query.error_description);
			}

			if(http_request.query.state != state) {
				error = Error("Linkedin.acceptAuthCode(http_request): http_request.query.state does not match original request's state");
			}

			if(!http_request.query.code) {
				error = Error("Linkedin.acceptAuthCode(http_request): there is no auth code");
			}

			callback(error, http_request.query.code);

		},
		// Step 3 — Exchange Authorization Code for an Access Token
		requestAccessToken: function(auth_code, callback) {

			var options = {
				hostname: 'www.linkedin.com',
				port: 443,
				path: '/oauth/v2/accessToken',
				method: 'POST'
			};

			var access_token_request = https.request(options, (access_token_response) => {

				var data = '';
				access_token_response.on('data', (chunk) => {
					data += chunk;
				});

				access_token_response.on('end', () => {
					var json = JSON.parse(data);
					console.log("ACCESS TOKEN", json.access_token);
					console.log("...expires in", json.expires_in);
					this._state.access_token = json.access_token;
					this._state.auth_token_expiry = Date.now() + json.expires_in;
					callback();
				})			
			});

			access_token_request.setHeader('Content-Type', 'application/x-www-form-urlencoded');
			access_token_request.setHeader('Host', 'www.linkedin.com');
			access_token_request.setHeader('User-Agent', 'curl/7.43.0');
			access_token_request.setHeader('Accept', '*/*');

			access_token_request.on('error', (e) => {
				callback(e);
			})

			var url_encode_body = querystring.stringify({
				grant_type: 'authorization_code',
				code: auth_code,
				redirect_uri: redirect_uri,
				client_id: client_id,
				client_secret: client_secret
			})

			access_token_request.write(url_encode_body);
			access_token_request.end();
		},
		_request: function() {
			// GET /v1/people/~ HTTP/1.1
			// Host: api.linkedin.com
			// Connection: Keep-Alive
			// Authorization: Bearer AQXdSP_W41_UPs5ioT_t8HESyODB4FqbkJ8LrV_5mff4gPODzOYR
			// res.setHeader('Host', 'api.linkedin.com');
			// res.setHeader('Connection', 'Keep-Alive');
			// res.setHeader('Authorization', 'Bearer ' + this._state.access_token);
		}
	}
}
