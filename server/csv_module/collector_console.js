/**
 * Created by yanzhig on 12/18/2015.
 */
var path=require("path");
var _ = require(path.join(__dirname, '/../node_modules/lodash/index'));
var Collector=require(path.join(__dirname, '/../csv_module/standard_csv_collector'));
var C=require(path.join(__dirname, '/../lib/common-funs'));
var conf=require(path.join(__dirname,'/../conf/csv_collector'));

module.exports = (function() {
    'use strict';
    var S = {};

    var timer;
    var status='stopped';
    var latestScan;
    var logMessages=[];
    S.startTimer=function(req,res){
        if(status==='started'){
            res.send('already started');
            res.end();
        }else{
            status='started';
            timer=setInterval(function(){
                latestScan=new Date().toISOString();
                console.log("scan director @",latestScan);

                C.walk(path.join(__dirname, _.get(conf,'DIR')),function(err,files){
                    _.forEach(_.filter(files,function(file) {
                        return _.endsWith(file, '.csv');
                    }),function(file){
                        Collector.collectFile(file,function(log){
                            logMessages.push(log);
                        });
                    });
                });
            }, _.get(conf,'interval'));
            res.send('started');
            res.end();
        }
    };
    S.stopTimer=function(req,res){
        clearInterval(timer);
        status='stopped';
        res.send('stopped');
        res.end();

    };
    S.status=function(req,res){
        var ret='The collector is '+status+'.';
        if(latestScan){
            ret+=' Latest scan at '+latestScan;
        }
        res.send(ret);
        res.end();
    };
    S.history=function(req,res){
        res.send(logMessages);
        res.end();
    };

    return S;
}());