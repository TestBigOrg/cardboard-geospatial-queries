var queue = require('d3-queue').queue;
var Dyno = require('dyno');

module.exports = function(config) {
  // setups how we interact with ES

  var dyno = Dyno(config);

  var api = {
    queryMatch: function(params, cb) {
      var opts = {
        Limit: 1000,
        ExpressionAttributeNames: {
          '#id': 'id',
          '#s': 'search'
        },
        ExpressionAttributeValues: {
          ':id': params.dataset+'!bbox',
          ':s': params.search
        },
        KeyConditionExpression: '#id = :id AND begins_with(#s, :s)' 
      };
      if (params.start) opts.ExclusiveStartKey = params.start;

      dyno.query(opts, function(err, result) {
        if (err) return cb(err);
        cb(null, result);
      });
    },
    getBatch: function(dataset, features, cb) {
      var keys = features.map(function(feature) {
        return {
          id: dataset+'!bbox!'+feature,
          search: 'feature'
        };
      });

      var params = { RequestItems: {} };
      params.RequestItems[config.table] = { Keys: keys };

      dyno.batchGetAll(params, 3).sendAll(10, function(err, result) {
        if (err) return cb(err);
        if (result.UnprocessedKeys && result.UnprocessedKeys.length) return cb(new Error('Failed to process all items'));
        cb(null, result.Responses[config.table]);
      });
    },
    get: function(dataset, feature, cb) {
      dyno.getItem({ Key: {
        id: dataset+'!bbox!'+feature,
        search: 'feature'
      }}, function(err, data) {
        if (err) return cb(err);
        cb(null, data.Item);
      });
    },
    getQuadkey: function(dataset, feature, qk, cb) {
      dyno.getItem({
        Key: {
          id: dataset+'!bbox',
          search: qk+'!'+feature
        }
      }, function(err, data) {
        if (err) return cb(err);
        cb(null, data.Item);
      });
    },
    put: function(searchResult, cb) {
        var q = queue(10);
        q.defer(function(done) {
          dyno.putItem({
            Item: {
              id: searchResult.dataset+'!bbox!'+searchResult.feature,
              search: 'feature',
              quadkeys: searchResult.quadkeys
            }     
          }, done);
        });
        searchResult.quadkeys.forEach(function(qk) {
          q.defer(function(done) {
            dyno.putItem({
              Item: {
                id: searchResult.dataset+'!bbox',
                search: qk+'!'+searchResult.feature
              }     
            }, done);
          });
        });
        q.awaitAll(cb);
    }
  };
  return api;
}
