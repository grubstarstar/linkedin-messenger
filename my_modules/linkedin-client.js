var https       = require('https');
var querystring = require('querystring');

module.exports.create = function(options) {

	var client_id     = options.client_id;
	var client_secret = options.client_secret;
	var redirect_uri  = options.redirect_uri;
	var scope         = options.scope;

	return {
		hasAccessToken: function() {
			return this.access_token;
		},
		needsNewToken: function() {
			return !this.hasAccessToken() || (Date.now() >= this.access_token_expiry - 60);
		},
		requestAuthorisation: function(http_response, state) {
			this._last_state_string = state;
			var qstring = {
				client_id: client_id,
				redirect_uri: redirect_uri,
				response_type: 'code',
				state: state
			};
			if(scope) {
				qstring.scope = scope;
			}
			return http_response.redirect(
				'https://www.linkedin.com/oauth/v2/authorization?' + querystring.stringify(qstring)
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

			if(http_request.query.state != this._last_state_string) {
				error = Error("Linkedin.acceptAuthCode(http_request): http_request.query.state does not match original request's state");
			}
			delete this._last_state_string;

			if(!http_request.query.code) {
				error = Error("Linkedin.acceptAuthCode(http_request): there is no auth code");
			}

			callback(error, http_request.query.code);

		},
		// Step 3 — Exchange Authorization Code for an Access Token
		requestAccessToken: function(auth_code, callback) {

			var self = this;

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

				access_token_response.on('end', (e) => {
					var json = JSON.parse(data);
					console.log("ACCESS TOKEN", json.access_token);
					console.log("...expires in", json.expires_in);
					self.access_token = json.access_token;
					self.access_token_expiry = Date.now() + json.expires_in;
					callback(e);
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
		_request: function(method, resource_path, data, callback) {
			// GET /v1/people/~ HTTP/1.1
			// Host: api.linkedin.com
			// Connection: Keep-Alive
			// Authorization: Bearer AQXdSP_W41_UPs5ioT_t8HESyODB4FqbkJ8LrV_5mff4gPODzOYR

			resource_path += resource_path + '?format=json';

			if(method == "GET") {
				resource_path = resource_path + '&' + querystring.stringify(data);
			}

			var options = {
				hostname: 'api.linkedin.com',
				port: 443,
				path: resource_path,
				method: method
			};

			var req = https.request(options, (res) => {

				var data = '';
				res.on('data', (chunk) => {
					data += chunk;
				});

				res.on('end', (e) => {
					var json = JSON.parse(data);
					callback(e, json);
				});		
			});

			req.on('error', (e) => {
				callback(e);
			})

			req.setHeader('Host', 'api.linkedin.com');
			req.setHeader('Connection', 'Keep-Alive');
			req.setHeader('Authorization', 'Bearer ' + this.access_token);

			if(method == "POST") req.write(JSON.stringify(data));

			req.end();
		},
		people: function(callback) {
			this._request('GET', '/v1/people/~', null, (error, json) => {
				callback(error, json);
			});
		}
	}
}
