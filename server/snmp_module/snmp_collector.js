/**
 * Created by yanzhig on 12/22/2015.
 */
var path=require('path');
//var fs = require('fs');
var csv = require(path.join(__dirname,'/../node_modules/csv/lib/index'));
var snmp = require(path.join(__dirname,'/../node_modules/snmp-native/lib/snmp'));
var _ = require(path.join(__dirname,'/../node_modules/lodash/index'));
var n4j=require(path.join(__dirname, '/../neo4j_module/neo4j_funs'));
var Parser = require(path.join(__dirname, '/../lib/parser')).Parser;
var os=require('os');
var async=require(path.join(__dirname,'/../node_modules/async/dist/async'));
//var conf=require(path.join(__dirname,'/../conf/csv_collector'));
module.exports = (function() {
    'use strict';
    var P={};
    P.collectAndPopulate=function(jobOfOneDevice,ts, callback){
        P.collect(jobOfOneDevice,function(err,results){
            if(!err){
                var statements=[];
                var device= _.get(jobOfOneDevice,'device');
                var jobs= _.get(jobOfOneDevice,'jobs');
                _.forEach(_.flatten(results),function(result){
                        var j=_.find(jobs,{id:result.id});
                        if(j){
                            // create kpi instance
                            var key=device.id+'_'+ j.name+"_"+ts+'_'+ j.interval;
                            if(_.isNaN(result.value)){  //string
                                statements.push({statement:'match (ne:INSTANCE{id:"'+device.id+'"}) , (g:GRANULARITY{num:'+j.interval+'}) ,(kd:KPI_DEF{id:'+result.id+'}) with ne,g,kd create (k:KPI_VALUE{id:'+result.id+',key:"'+key+'",name:"'+ j.name+'", ts:'+ts+',value:"'+result.value+'",raw:"'+(result.raw||result.value)+'",gran:'+ j.interval+', neID:"'+device.id+'",updateTS:'+Date.now()+'"}) , (ne)-[:HAS_KPI_VALUE]->(k) , (g)-[:HAS_KPI_VALUE]->(k),(kd)-[:HAS_KPI_VALUE]->(k)'});
                            }else {  //number
                                statements.push({statement:'match (ne:INSTANCE{id:"'+device.id+'"}) , (g:GRANULARITY{num:'+j.interval+'}) ,(kd:KPI_DEF{id:'+result.id+'}) with ne,g,kd create (k:KPI_VALUE{id:'+result.id+',key:"'+key+'",name:"'+ j.name+'", ts:'+ts+',value:'+result.value+',raw:'+(result.raw||result.value)+',gran:'+ j.interval+', neID:"'+device.id+'",updateTS:'+Date.now()+'"}), (ne)-[:HAS_KPI_VALUE]->(k) , (g)-[:HAS_KPI_VALUE]->(k),(kd)-[:HAS_KPI_VALUE]->(k)'});
                            }
                        }else{
                            console.log('jjjjjjjjj',j,result.id);
                        }
                    }
                );
                //console.log('statements:',statements);
                n4j.runCypherStatementsReturnErrors(statements,function(err,result){
                    callback(err,result);
                });
            }  else{
                callback(err,null);
            }
        });
    };
    P.collect=function(jobOfOneDevice,callback){
        var device= _.get(jobOfOneDevice,'device');
        var jobs= _.get(jobOfOneDevice,'jobs');
        if(!device||!jobs){
            console.log('Error in job definition');
            return;
        }

        var session = new snmp.Session({host: device.ip, community: device.community,version:device.version==='2c'?1:0 });
        var getOids=[];
        var walkJobs=[];
        var getJobs=[];
        _.forEach(_.filter(jobs,function(j){
            if(j.method==='walk'){
                walkJobs.push(j);
            }else if(j.method==='get'){
                getJobs.push(j);
            }
            return j.method==='get';
        }),function(j){
            getOids=getOids.concat(j.collectArray);
        });
        console.log('get list:',JSON.stringify(getOids));
        async.parallel(
            [
                async.apply(getAll,session,getOids,getJobs),
                async.apply(walkAll,session,walkJobs)
            ],function(err,results){
                session.close();
                if(err){
                    callback(err,null);
                }else{
                    callback(null,results);
                }
            }
        );
    };
    function walkAll(session,jobs,callback){
        async.map(jobs,_walk,function(err,results){
            if(err){
                console.log('walkAll return error',err);
                callback(err,null);
            }else{
                callback(null,results);
            }
        });
        function _walk(job,callback){
            var oid= _.get(job,'collectArray[0]');
            var method= _.get(job,'aggregation');
            session.getSubtree({ oid: oid }, function (err, varbinds) {
                if (err) {
                    console.error('Failed to walk snmp data:'.oid);
                    callback(err,null);
                } else {
                    var v1=[];
                    if(method!=='count'){
                        v1= _.map(_.filter(varbinds, function(v){
                            return v.type===2|| v.type===4|| v.type===65|| v.type===66|| v.type===70;
                        }),'value');
                    }else{
                        v1= _.map(varbinds,'value');
                    }

                    //console.log('vvvvvvvvvv',v1);
                    var value;
                    switch(method){
                        case 'sum':
                            value=_.sum(v1);
                            break;
                        case 'avg':
                            if(v1.length<1){
                                value=0;
                            }else{
                                value= _.sum(v1)/v1.length;
                            }
                            break;
                        case 'max':
                            value= _.max(v1);
                            break;
                        case 'min':
                            value= _.min(v1);
                            break;
                        case 'count':
                            value=v1.length;
                            break;
                        default:
                            console.log('not support aggregation method '+method);
                            value=null;
                            break;
                    }
                    callback(null,{value:value,id:job.id});

                    //varbinds.forEach(function (vb) {
                    //    console.log('Name of interface ' + vb.oid[vb.oid.length - 1] + ' is "' + vb.value + '"', vb);
                    //});
                }
            });
        }
    }
    function getAll(session,oids,jobs,callback){
        session.getAll({ oids:oids}, function (error, varbinds) {
            if(error){
                console.error('Failed to get snmp data',error);
                callback(null,null);  //not block the whole process
            }else{
                var vars={};
                var ret=[];
                _.forEach(varbinds,function(v){
                    _.set(vars,makeKey(v.oid), v.value);
                });
                //console.log('vvvvvvvvvvvvvv',varbinds);
                async.each(jobs,function(job,callback){
                    try{
                        var method= _.get(job,'aggregation');
                        if(!method){
                            ret.push(
                                {
                                    id:job.id,
                                    value:Parser.evaluate(job.eFormula, vars)
                                }
                            );
                            callback(null);
                        }else{
                            if(method==='delta'){
                                //console.log('dddddddddddddddddelta');
                                var raw= _.get(vars,job.keys[0]);
                                var statement='match (e:KPI_VALUE{id:'+job.id+'}) return e order by e.ts desc limit 1';
                                n4j.runCypherWithReturn([{statement:statement}],function(err,result){
                                    if(err){
                                        ret.push(
                                            {
                                                id:job.id,
                                                value:0,
                                                raw:raw||0
                                            }
                                        );
                                    }else{
                                        //console.log('aaaaaaaaaaaaaa',result);
                                        var old= _.get(result, 'results[0].data[0].row[0].raw');
                                        if(!old){
                                            ret.push(
                                                {
                                                    id:job.id,
                                                    value:0,
                                                    raw:raw||0
                                                }
                                            );
                                        }else{
                                            var ots=_.get(result, 'results[0].data[0].row[0].ts');
                                            var v=0;
                                            if(ots){
                                                var interval=Date.now()-ots;  //TODO: not accuracy
                                                v=parseInt((raw-old)/(interval/job.interval/1000),10);
                                            }
                                            ret.push(
                                                {
                                                    id:job.id,
                                                    value:v,
                                                    raw:raw||0
                                                }
                                            );
                                        }

                                    }

                                    callback(null);
                                });
                            }else{
                                console.log('unknown aggregation method:',job);
                                callback(null);
                            }
                        }

                    }catch(e){
                        console.error('KPI parse error:',JSON.stringify(e));
                        callback(null);
                    }

                },function(err){
                    callback (null,ret);
                });

            }
        });
    }
    function makeKey(oid){
        var ret='K';
        oid.forEach(function(d){
            ret=ret+'_'+d;
        });
        return ret;
    }

    return P;
})();