var expect = require('chai').expect;
var request = require('request');

var app = require('../shortly.js');
var db = require('../app/config');
var Users = require('../app/collections/users');
var User = require('../app/models/user');
var Links = require('../app/collections/links');
var Link = require('../app/models/link');
var crypto = require('crypto');

/************************************************************/
// Mocha doesn't have a way to designate pending before blocks.
// Mimic the behavior of xit and xdescribe with xbeforeEach.
// Remove the 'x' from beforeEach block when working on
// authentication tests.
/************************************************************/
var xbeforeEach = function() {};
/************************************************************/


describe('', function() {

  var server;

  before(function() {
    server = app.listen(4568, function() {
      console.log('Shortly is listening on 4568');
    });
  });

  after(function() {
    server.close();
  });

  beforeEach(function() {
    // log out currently signed in user
    request('http://127.0.0.1:4568/logout', function(error, res, body) {});

    // delete link for roflzoo from db so it can be created later for the test
    db.knex('urls')
      .where('url', '=', 'http://roflzoo.com/')
      .del()
      .catch(function(error) {
        throw {
          type: 'DatabaseError',
          message: 'Failed to create test setup data'
        };
      });

    // delete user Svnh from db so it can be created later for the test
    db.knex('users')
      .where('name', '=', 'Svnh')
      .del()
      .catch(function(error) {
        // uncomment when writing authentication tests
        // throw {
        //   type: 'DatabaseError',
        //   message: 'Failed to create test setup data'
        // };
      });

    // delete user Phillip from db so it can be created later for the test
    db.knex('users')
      .where('name', '=', 'Phillip')
      .del()
      .catch(function(error) {
        // uncomment when writing authentication tests
        // throw {
        //   type: 'DatabaseError',
        //   message: 'Failed to create test setup data'
        // };
      });
  });

  xdescribe('Link creation:', function() {

    var requestWithSession = request.defaults({jar: true});

    beforeEach(function(done) {
      // create a user that we can then log-in with
      new User({
        'name': 'Phillip',
        'password': 'Phillip'
      }).save().then(function() {
        var options = {
          'method': 'POST',
          'followAllRedirects': true,
          'uri': 'http://127.0.0.1:4568/login',
          'json': {
            'name': 'Phillip',
            'password': 'Phillip'
          }
        };
        // login via form and save session info
        requestWithSession(options, function(error, res, body) {
          done();
        });
      });
    });

    it('Only shortens valid urls, returning a 404 - Not found for invalid urls', function(done) {
      var options = {
        'method': 'POST',
        'uri': 'http://127.0.0.1:4568/links',
        'json': {
          'url': 'definitely not a valid url'
        }
      };

      requestWithSession(options, function(error, res, body) {
        // res comes from the request module, and may not follow express conventions
        expect(res.statusCode).to.equal(404);
        done();
      });
    });

    xdescribe('Shortening links:', function() {

      var options = {
        'method': 'POST',
        'followAllRedirects': true,
        'uri': 'http://127.0.0.1:4568/links',
        'json': {
          'url': 'http://roflzoo.com/'
        }
      };

      it('Responds with the short code', function(done) {
        requestWithSession(options, function(error, res, body) {
          expect(res.body.url).to.equal('http://roflzoo.com/');
          expect(res.body.code).to.not.be.null;
          done();
        });
      });

      it('New links create a database entry', function(done) {
        requestWithSession(options, function(error, res, body) {
          db.knex('urls')
            .where('url', '=', 'http://roflzoo.com/')
            .then(function(urls) {
              if (urls['0'] && urls['0']['url']) {
                var foundUrl = urls['0']['url'];
              }
              expect(foundUrl).to.equal('http://roflzoo.com/');
              done();
            });
        });
      });

      it('Fetches the link url title', function (done) {
        requestWithSession(options, function(error, res, body) {
          db.knex('urls')
            .where('title', '=', 'Funny pictures of animals, funny dog pictures')
            .then(function(urls) {
              if (urls['0'] && urls['0']['title']) {
                var foundTitle = urls['0']['title'];
              }
              expect(foundTitle).to.equal('Funny pictures of animals, funny dog pictures');
              done();
            });
        });
      });

    }); // 'Shortening links'

    xdescribe('With previously saved urls:', function() {

      var link;

      beforeEach(function(done) {
        // save a link to the database
        link = new Link({
          url: 'http://roflzoo.com/',
          title: 'Funny pictures of animals, funny dog pictures',
          baseUrl: 'http://127.0.0.1:4568'
        });
        link.save().then(function() {
          done();
        });
      });

      it('Returns the same shortened code', function(done) {
        var options = {
          'method': 'POST',
          'followAllRedirects': true,
          'uri': 'http://127.0.0.1:4568/links',
          'json': {
            'url': 'http://roflzoo.com/'
          }
        };

        requestWithSession(options, function(error, res, body) {
          var code = res.body.code;
          expect(code).to.equal(link.get('code'));
          done();
        });
      });

      it('Shortcode redirects to correct url', function(done) {
        var options = {
          'method': 'GET',
          'uri': 'http://127.0.0.1:4568/' + link.get('code')
        };

        requestWithSession(options, function(error, res, body) {
          var currentLocation = res.request.href;
          expect(currentLocation).to.equal('http://roflzoo.com/');
          done();
        });
      });

      it('Returns all of the links to display on the links page', function(done) {
        var options = {
          'method': 'GET',
          'uri': 'http://127.0.0.1:4568/links'
        };

        requestWithSession(options, function(error, res, body) {
          expect(body).to.include('"title":"Funny pictures of animals, funny dog pictures"');
          expect(body).to.include('"code":"' + link.get('code') + '"');
          done();
        });
      });

    }); // 'With previously saved urls'

  }); // 'Link creation'

  xdescribe('Privileged Access:', function() {

    it('Redirects to login page if a user tries to access the main page and is not signed in', function(done) {
      request('http://127.0.0.1:4568/', function(error, res, body) {
        expect(res.req.path).to.equal('/login');
        done();
      });
    });

    it('Redirects to login page if a user tries to access the create page and is not signed in', function(done) {
      request('http://127.0.0.1:4568/create', function(error, res, body) {
        expect(res.req.path).to.equal('/login');
        done();
      });
    });

    it('Redirects to login page if a user tries to see all of the links and is not signed in', function(done) {
      request('http://127.0.0.1:4568/links', function(error, res, body) {
        expect(res.req.path).to.equal('/login');
        done();
      });
    });

  }); // 'Priviledged Access'

  xdescribe('Account Creation:', function() {

    it('Signup creates a user record', function(done) {
      var options = {
        'method': 'POST',
        'uri': 'http://127.0.0.1:4568/signup',
        'json': {
          'name': 'Svnh',
          'password': 'Svnh'
        }
      };

      request(options, function(error, res, body) {
        db.knex('users')
          .where('name', '=', 'Svnh')
          .then(function(res) {
            if (res[res.length - 1] && res[res.length - 1]['name']) {
              var user = res[res.length - 1]['name'];
            }
            expect(user).to.equal('Svnh');
            done();
          }).catch(function(err) {
            console.log('DIS DA ERROR', err);
            // throw {
            //   type: 'DatabaseError',
            //   message: 'Failed to create test setup data'
            // };
          });
      });
    });

    it('Signup logs in a new user', function(done) {
      var options = {
        'method': 'POST',
        'uri': 'http://127.0.0.1:4568/signup',
        'json': {
          'name': 'Phillip',
          'password': 'Phillip'
        }
      };

      request(options, function(error, res, body) {
        expect(res.headers.location).to.equal('/');
        done();
      });
    });

  }); // 'Account Creation'

  xdescribe('Account Login:', function() {


    var requestWithSession = request.defaults({jar: true});
    const hash = crypto.createHash('sha256');
    const password = hash.update('Phillip').digest('hex');

    beforeEach(function(done) {
      new User({
        'name': 'Phillip',
        'password': password
      }).save().then(function() {
        done();
      });
    });

    it('Logs in existing users', function(done) {
      var options = {
        'method': 'POST',
        'uri': 'http://127.0.0.1:4568/login',
        'json': {
          'username': 'Phillip',
          'password': 'Phillip'
        }
      };

      requestWithSession(options, function(error, res, body) {
        expect(res.headers.location).to.equal('/');
        done();
      });
    });

    it('Users that do not exist are kept on login page', function(done) {
      var options = {
        'method': 'POST',
        'uri': 'http://127.0.0.1:4568/login',
        'json': {
          'name': 'Fred',
          'password': 'Fred'
        }
      };

      requestWithSession(options, function(error, res, body) {
        expect(res.headers.location).to.equal('/login');
        done();
      });
    });

  }); // 'Account Login'

  xdescribe('Logout User:', function() {
    it('Logs a user out and redirects them to login page', function(done) {
      request('http://127.0.0.1:4568/logout', function(error, res, body) {
        expect(res.req.path).to.equal('/login');
        done();
      });
    });
  });

  xdescribe('Hash Type for Password: ', function() {
    it('Should use a sha256 hash for the password hash', function(done) {

      var options = {
        'method': 'POST',
        'uri': 'http://127.0.0.1:4568/signup',
        'json': {
          'username': 'Patches',
          'password': 'getGUDscrub'
        }
      };

      const hash = crypto.createHash('sha256');
      const hashedPassword = hash.update('getGUDscrub').digest('hex');

      request(options, function(error, res, body) {
        db.knex('users')
          .where('name', '=', 'Patches')
          .then(function(res) {
            var password;
            if (res[res.length - 1] && res[res.length - 1]['password']) {
              password = res[res.length - 1]['password'];
            }
            expect(password).to.equal(hashedPassword);
            done();
          }).catch(function(err) {
            console.log('YOU DIED', err);
          });
      });
    });
  });

  xdescribe('User Collision: ', function() {

    var options = {
      'method': 'POST',
      'uri': 'http://127.0.0.1:4568/signup',
      'json': {
        'username': 'Patches',
        'password': 'getGUDscrub'
      }
    };

    it('Should send back a status code of 418 ☕️ if signing with a username that is already taken', function(done) {
      request(options, function(error, res, body) {
        expect(res.statusCode).to.equal(418);
        done();
      });
    });
  });
});



//logout, check hash type for passwords, user collision,


