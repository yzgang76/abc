/**
 * Created by yanzhig on 1/6/2016.
 */
var path=require('path');
//var input=require();
var _ = require(path.join(__dirname,'/../node_modules/lodash/index'));
var n4j=require(path.join(__dirname, '/../neo4j_module/neo4j_funs'));
var async=require(path.join(__dirname,'/../node_modules/async/dist/async'));
var C=require(path.join(__dirname,'/../lib/common-funs'));
var Parser = require(path.join(__dirname, '/../lib/parser')).Parser;
var kpi_engine=require(path.join(__dirname, '/../kpi/kpi_engine'));

module.exports = (function() {
    'use strict';
    var E = {};
    var threshold_engine={
        messages:{
            ERROR1:"Failed to fetch Threshold definitions",
            ERROR2:"Failed to evaluate Threshold values"
        }
    };
    var history=[];
    var msg=threshold_engine.messages;
    E.evaluate=function(ts,gran,callback){
        async.parallel([
            async.apply(E.evaluateRaw,ts,gran),
            async.apply(E.evaluateNotRaw,ts,gran)
        ],function(err,result){
            callback(null,history);
        });
    };

    E.evaluateRaw=function(ts,gran,callback){
        console.log('evaluating for Raw...');
        async.waterfall([
            async.apply(_getThresholdsForRaw,gran),
            async.apply(_evaluateThresholdsForRaw)
        ],function(err,result){
            console.log('************** complete threshold evaluation for Raw-',ts,gran);
            callback(null,null);
        });
        function _getThresholdsForRaw(gran,callback){
            var statement='match (t:THRESHOLD)<-[:HAS_THRESHOLD]-(k:KPI_DEF{type:0})<-[:HAS_KPI]-(g:GRANULARITY{num:'+gran+'}) return t';
            n4j.runCypherWithReturn([{statement:statement}],function(err,result){
                if(err){
                    console.log (msg.ERROR1,JSON.stringify(err));
                    callback(err, null);
                }else{
                    //console.log('rrrrrrrrr',result.results[0].data);
                    callback(null, _.get(result,'results[0].data'));
                }
            });
        }
        function _evaluateThresholdsForRaw(defs,callback){
            //console.log('_evaluateThresholds',defs);
            async.each(defs,async.apply(__evaluateThresholdForRaw),function(err){
               callback(null,null);
            });
            function __evaluateThresholdForRaw(def,callback){
                //console.log('_______________________evaluateThreshold',def.row[0]);
                var statement='match (a:ACTION)<-[:HAS_ACTION]-(t:THRESHOLD{id:'+def.row[0].id+'})<-[:HAS_THRESHOLD]-(k:KPI_DEF)-[:HAS_KPI_VALUE]->(v:KPI_VALUE)<-[:HAS_KPI_VALUE]-(n:INSTANCE) where '+ def.row[0].condition+' and v.ts<='+ts+' and v.ts>'+(ts-gran*1000)+' return a,v,n,t';
                n4j.runCypherWithReturn([{statement:statement}],function(err,result){
                    if(err){
                        console.log (msg.ERROR2,JSON.stringify(err));
                        callback(err);
                    }else{
                        //console.log('rrrrrrrrrrrrrrr',result.results[0].data);
                        var broken=_.get(result,'results[0].data[0].row');//shall only have 1 record

                        if(broken&&broken.length>0){
                            var action= broken[0];
                            var kpiValue=broken[1];
                            var ne= broken[2];
                            var threshold= broken[3];
                            //TODO: implement action
                            var info="[Threshold broken] @"+kpiValue.ts+'-condition: '+threshold.condition+' ;value:'+kpiValue.value+ ";NE:("+ne.type+")"+ne.id+'; trigger action:'+ action.type;
                            console.log(info);
                            history.push(info);
                        }
                        callback(null);
                    }
                });
            }
        }
    };
    E.evaluateNotRaw=function(ts,gran,callback){
        console.log('evaluating for Not Raw...');
        async.waterfall([
            async.apply(_getThresholdsNotForRaw,gran),
            async.apply(_evaluateThresholdsNotForRaw)
        ],function(err,result){
            console.log('*********** complete threshold evaluation for Not Raw-',ts,gran);
            callback(null,null);
        });

        function _getThresholdsNotForRaw(gran,callback){
            var statement='match (a:ACTION)<-[:HAS_ACTION]-(t:THRESHOLD)<-[:HAS_THRESHOLD]-(k:KPI_DEF)<-[:HAS_KPI]-(g:GRANULARITY{num:'+gran+'}) where k.type<>0 return t,k,a';
            n4j.runCypherWithReturn([{statement:statement}],function(err,result){
                if(err){
                    console.log (msg.ERROR1,JSON.stringify(err));
                    callback(err, null);
                }else{
                    callback(null, _.get(result,'results[0].data'));
                }
            });
        }
        function _evaluateThresholdsNotForRaw(defs,callback){

            async.each(defs,async.apply(__evaluateThresholdNotForRaw),function(err){
                callback(null,null);
            });
            function __evaluateThresholdNotForRaw(def,callback){
                var threshold_def= _.get(def,'row[0]');
                var kpi_def=_.get(def,'row[1]');
                var action=_.get(def,'row[2]');
                console.log('_evaluateThresholdsNotForRaw',threshold_def,kpi_def);
                kpi_engine.getKPIValue(function(err,data){
                 //console.log('get kpi('+id+'):',JSON.stringify(d));
                 //console.log('Request completed in ' + (os.uptime() - startTime)+'s');
                 //   console.log('dddddddddddd',JSON.stringify(data));
                    var p=threshold_def.condition.replaceAll("v.value","v");
                    _.forEach(data,function(k){
                        try{
                            if(Parser.evaluate(p, {v: _.get(k,kpi_def.name)})){
                                var info="[Threshold broken] @"+k.ts+'-condition: '+threshold_def.condition+' ;value:'+ _.get(k,kpi_def.name)+ ";NE:"+ k.ne+'; trigger action:'+ action.type;
                                console.log(info);
                                history.push(info);
                            }
                        }catch(e){
                            console.error("Parse error:",e);
                        }

                    });
                    callback(null,null);
                 },kpi_def.id,ts);
            }

        }
    };

    return E;
})();