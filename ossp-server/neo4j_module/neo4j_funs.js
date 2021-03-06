/**
 * Created by yanzhig on 12/5/2015.
 */
var path=require('path');
//var input=require();
var fs = require('fs');
var _ = require(path.join(__dirname,'/../node_modules/lodash/index'));
var C=require(path.join(__dirname,'/../lib/common-funs'));
var neo4j_conf=require(path.join(__dirname,'/../conf/neo4j'));
module.exports = (function() {
    'use strict';
    var N={};
    var printStatement=neo4j_conf.printStatement;
    N.getNodes=function(req,res){
        var type=req.params.type;
        var payload={
            "statements": [
                {
                    "statement": type==="all"?
                        "match (e) return e":"match (e:"+type+") return e"
                    /* "resultDataContents": [
                     "row",
                     "graph"
                     ],
                     "includeStats": true*/
                }
            ]
        };

        var url='/db/data/transaction/';
        C.makeQuery(C.neo4j_server,url,function(err,r,body){
            if(err){
                //console.log("getAllNode return with error: ",JSON.stringify(err),body);
                res.status(500).send({
                    headers: r.headers,
                    errors:body
                });
                res.end();
            }else{
                //console.log('rrrrrrrrrrrrrrr',body);
                res.status(r.statusCode).send(body.results);
                res.end();
            }


        },'POST',payload);

    };
    N.runCypherFile=function(file){
        fs.readFile(path.join(__dirname,'/../../cypher/'+file), 'utf-8', function(err, data) {
            if (err) {
               console.log(err);
            } else {
                //console.log(data);
                var statements=[];
                _.forEach(data.split(";"),function(statement){
                    var stat=statement.replace("\r\n",'').trim();
                    //console.log(stat);
                    if(stat.length>0){
                        statements.push({
                            statement:stat
                        });
                    }
                });
                //console.log(statements);
                var url='/db/data/transaction/commit';
                C.makeQuery(C.neo4j_server,url,function(err,r,body){
                    if(err){
                        //console.log("getAllNode return with error: ",JSON.stringify(err),body);
                        console.log({
                            headers: r.headers,
                            errors:body
                        });
                    }else{
                        console.log('reutrn with errors:',body.errors);
                    }


                },'POST',{"statements":statements},printStatement);

            }
        });
    };
    N.runCypherStatements=function(statements){
        var url='/db/data/transaction/commit';
        C.makeQuery(C.neo4j_server,url,function(err,r,body){
            if(err){
                //console.log("getAllNode return with error: ",JSON.stringify(err),body);
                console.log({
                    headers: r.headers,
                    errors:body
                });
            }else{
                console.log('makeQuery return with errors:',body.errors);
            }
        },'POST',{"statements":statements},false);
    };
    N.runCypherStatementsReturnErrors=function(statements,callback){
        if(!statements||statements.length<1){
            callback(null,null);
        }else{
            var url='/db/data/transaction/commit';
            C.makeQuery(C.neo4j_server,url,function(err,r,body){
                console.log(err, r.body);
                if(err){
                    callback(err,null);
                }else{
                    callback(null,body.errors);
                }
            },'POST',{"statements":statements},printStatement);
        }
    };
    N.runCypherWithReturn=function(statements,callback){
        var url='/db/data/transaction/commit';
        C.makeQuery(C.neo4j_server,url,function(err,r,body){
            if(err){
                console.log("getAllNode return with error: ",JSON.stringify(err),body);
                console.log({
                    headers: r.headers,
                    errors:body
                });
                callback(err, undefined);
            }else{
                //console.log('makeQuery return :',JSON.stringify(body));
                callback(null, body);
            }
        },'POST',{"statements":statements},printStatement);
    };
    return N;
})();
