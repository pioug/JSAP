// This defines a master object for holding all the plugins and communicating
// This object will also handle creation and destruction of plugins


var PluginFactory = function (context, dir) {

    var audio_context = context,
        subFactories = [],
        plugin_prototypes = [],
        pluginsList = [],
        currentPluginId = 0,
        script,
        self = this;

    /*
        this.loadResource. Load a resource into the global namespace
        
        @param resourceObject: a JS object holding the following parameters:
            .url: URL of the resource
            .test: function to call, returns true if resource already loaded, false if not
    */
    this.loadResource = function (resourceObject) {
        if (resourceObject) {
            if (typeof resourceObject.url !== "string") {
                throw ("resourceObject.url must be a string");
            }
            if (typeof resourceObject.test !== "function") {
                throw ("resourceObject.test must be a function");
            }
            var response = resourceObject.test();
            if (response !== false && response !== true) {
                throw ("resourceObject.test must return true or false");
            }
            switch (resourceObject.type) {
                case "CSS":
                case "css":
                    return new Promise(function (resolve, reject) {
                        var css = document.createElement("link");
                        css.setAttribute("rel", "stylesheet");
                        css.setAttribute("type", "text/css");
                        css.setAttribute("href", resourceObject.url);
                        document.getElementsByTagName("head")[0].appendChild(css);
                        resolve(resourceObject);
                    });
                    break;
                case "javascript":
                case "JavaScript":
                case "Javascript":
                case undefined:
                default:
                    if (!response) {
                        return loadResource(resourceObject).then(function (resourceObject) {
                            if (typeof resourceObject.returnObject === "string") {
                                var returnObject;
                                eval("returnObject = " + resourceObject.returnObject);
                                return returnObject;
                            } else {
                                return true;
                            }
                        });
                    } else {
                        return new Promise(function (resolve, reject) {
                            if (typeof resourceObject.returnObject === "string") {
                                eval("resolve(" + resourceObject.returnObject + ")");
                            } else {
                                resolve(true);
                            }
                        });
                    }
            }
        }
    }

    this.loadPluginScript = function (resourceObject) {
        if (resourceObject) {
            if (typeof resourceObject.returnObject !== "string") {
                throw ("resourceObject.returnObject must be the name of the prototype function");
            }
            return this.loadResource(resourceObject).then(function (plugin) {
                return self.addPrototype(plugin);
            });
        }
    }

    function loadResource(resourceObject) {
        return new Promise(function (resolve, reject) {
            var script = document.createElement("script");
            script.src = resourceObject.url;
            document.getElementsByTagName("head")[0].appendChild(script);
            script.onload = function () {
                resolve(resourceObject);
            }
        });
    };

    if (dir === undefined) {
        dir = "jsap/";
    }

    var PluginInstance = function (id, plugin_node) {
        this.next_node = undefined;

        this.reconnect = function (new_next) {
            if (new_next !== this.next_node) {
                if (this.next_node != undefined && typeof this.next_node.getInputs == "function") {
                    plugin_node.disconnect(this.next_node.getInputs()[0]);
                }
                this.next_node = new_next;
                if (this.next_node != undefined && typeof this.next_node.getInputs == "function") {
                    plugin_node.connect(this.next_node.getInputs()[0]);
                }
                return true;
            }
            return false;
        };

        this.disconnect = function () {
            this.reconnect(undefined);
        };

        this.destory = function () {
            plugin_node.destroy();
        };

        Object.defineProperties(this, {
            'id': {
                'value': id
            },
            'node': {
                'value': plugin_node
            },
            'getInputs': {
                'value': function () {
                    return plugin_node.getInputs();
                }
            },
            'getOutputs': {
                'value': function () {
                    return plugin_node.getOutputs();
                }
            }
        });
    };

    var PluginPrototype = function (proto) {
        Object.defineProperties(this, {
            'name': {
                value: proto.prototype.name
            },
            'proto': {
                value: proto
            },
            'version': {
                value: proto.prototype.version
            },
            'uniqueID': {
                value: proto.prototype.uniqueID
            }
        });

        this.createPluginInstance = function (owner) {
            if (!this.ready) {
                throw ("Plugin Not Read");
            }
            var plugin = new proto(this.factory, owner);
            var node = new PluginInstance(currentPluginId++, plugin);
            var basePluginInstance = plugin;
            while (basePluginInstance.constructor !== BasePlugin) {
                basePluginInstance = basePluginInstance.__proto__;
            }
            Object.defineProperties(basePluginInstance, {
                'pluginInstance': {
                    'value': node
                },
                'prototypeObject': {
                    'value': this
                },
                'name': {
                    value: proto.prototype.name
                },
                'version': {
                    value: proto.prototype.version
                },
                'uniqueID': {
                    value: proto.prototype.uniqueID
                },
                'SesionData': {
                    value: this.factory.SessionData
                },
                'UserData': {
                    value: this.factory.UserData
                }
            });
            Object.defineProperty(node, "prototypeObject", {
                'value': this
            });
            this.factory.registerPluginInstance(node);
            return node;
        };

        function loadResourceChain(resourceObject, p) {
            if (!p) {
                var p = loadResource(resourceObject);
                p.then(function (resourceObject) {
                    if (resourceObject.resources !== undefined && resourceObject.resources.length > 0) {
                        for (var i = 0; i < resourceObject.resources.length; i++) {
                            p = loadResourceChain(resourceObject.resources[i], p);
                        }
                    }
                });
            } else {
                p.then(loadResource(resourceObject));
            }
            return p;
        }

        function loadStylesheet(url) {
            var css = document.createElement("link");
            css.setAttribute("rel", "stylesheet");
            css.setAttribute("type", "text/css");
            css.setAttribute("href", url);
            document.getElementsByTagName("head")[0].appendChild(css);
        }

        function recursiveGetTest(resourceObject) {
            if (resourceObject.hasOwnProperty("length") && resourceObject.length > 0) {
                return recursiveGetTest(resourceObject[resourceObject.length - 1]);
            } else if (resourceObject.hasOwnProperty("resources")) {
                return recursiveGetTest(resourceObject.resources);
            } else {
                return resourceObject.test;
            }
        }

        var resourcePromises = [];
        for (var i = 0; i < proto.prototype.resources.length; i++) {
            var resource = proto.prototype.resources[i];
            switch (resource.type) {
                case "css":
                case "CSS":
                    loadStylesheet(resource.url);
                    break;
                case "javascript":
                case "Javascript":
                case "JavaScript":
                case "JS":
                default:

                    var object = {
                        'promise': loadResourceChain(resource),
                        'state': 0,
                        'complete': function () {
                            this.state = 1;
                        },
                        'test': recursiveGetTest(resource)
                    }
                    object.promise.then(object.complete.bind(object));
                    resourcePromises.push(object);
                    break;
            }
        }

        this.getResourcePromises = function () {
            return resourcePromises;
        };
        this.ready = function () {
            var state = true;
            for (var i = 0; i < resourcePromises.length; i++) {
                if (resourcePromises[i].state !== 1 || !resourcePromises[i].test()) {
                    state = false;
                    break;
                }
            }
            return state;
        }
    };

    this.addPrototype = function (plugin_proto) {
        var testObj = {
            'proto': plugin_proto,
            'name': plugin_proto.prototype.name,
            'version': plugin_proto.prototype.version,
            'uniqueID': plugin_proto.prototype.uniqueID
        };
        if (typeof plugin_proto !== "function") {
            throw ("The Prototype must be a function!");
        }
        if (typeof testObj.name !== "string" || testObj.name.length == 0) {
            throw ("Malformed plugin. Name not defined");
        }
        if (typeof testObj.version !== "string" || testObj.version.length == 0) {
            throw ("Malformed plugin. Version not defined");
        }
        if (typeof testObj.uniqueID !== "string" || testObj.uniqueID.length == 0) {
            throw ("Malformed plugin. uniqueID not defined");
        }
        var obj = plugin_prototypes.find(function (e) {
            var param;
            var match = 0;
            for (param in this) {
                if (e[param] == this[param]) {
                    match++;
                }
            }
            return match == 4;
        }, testObj);
        if (obj) {
            throw ("The plugin must be unique!");
        }
        obj = new PluginPrototype(plugin_proto);
        plugin_prototypes.push(obj);
        Object.defineProperties(obj, {
            'factory': {
                'value': this
            }
        });
        return obj;
    };

    this.getPrototypes = function () {
        return plugin_prototypes;
    };

    this.getAllPlugins = function () {
        return pluginsList;
    };

    this.getAllPluginsObject = function () {
        var obj = {
                'factory': this,
                'subFactories': []
            },
            i;
        for (i = 0; i < subFactories.length; i++) {
            obj.subFactories.push({
                'subFactory': subFactories[i],
                'plugins': subFactories[i].getPlugins()
            });
        }
        return obj;
    };

    this.createSubFactory = function (chainStart, chainStop) {
        var node = new PluginSubFactory(this, chainStart, chainStop);
        Object.defineProperties(node, {
            'SessionData': {
                value: this.SessionData
            },
            'UserData': {
                value: this.UserData
            }
        });
        subFactories.push(node);
        return node;
    };

    this.destroySubFactory = function (SubFactory) {
        var index = subFactories.findIndex(function (element) {
            if (element === this) {
                return true;
            }
            return false;
        }, SubFactory);
        if (index >= 0) {
            subFactories.splice(index, 1);
            SubFactory.destroy();
        }
    };

    this.registerPluginInstance = function (instance) {
        if (pluginsList.find(function (p) {
                return p === this
            }, instance)) {
            throw ("Plugin Instance not unique");
        }
        pluginsList.push(instance);
        return true;
    }

    this.createPluginInstance = function (PluginPrototype) {
        throw ("DEPRECATED - Use PluginPrototype.createPluginInstance(owner);");
    };

    this.deletePlugin = function (id) {
        if (id >= 0 && id < pluginsList.length) {
            pluginsList.splice(id, 1);
        }
    };

    Object.defineProperty(this, "context", {
        'get': function () {
            return audio_context;
        },
        'set': function () {}
    });

    this.FeatureMap = function () {
        var Mappings = [];
        var SourceMap = function (Sender, pluginInstace) {
            var Mappings = [];
            this.getSourceInstance = function () {
                return pluginInstace;
            }
            this.getSender = function () {
                return Sender;
            }

            function updateSender() {
                function recursiveFind(featureList) {
                    var f, list = [];
                    for (f = 0; f < featureList.length; f++) {
                        var featureNode = list.find(function (e) {
                            return e.name === this.name;
                        }, featureList[f]);
                        if (!featureNode || (featureList[f].parameters && featureList[f].parameters.length != 0)) {
                            featureNode = {
                                'name': featureList[f].name,
                                'parameters': featureList[f].parameters,
                                'features': []
                            };
                            list.push(featureNode);
                        }
                        if (featureList[f].features && featureList[f].features.length > 0) {
                            featureNode.features = recursiveFind(featureList[f].features);
                        }
                    }
                    return list;
                }
                var i, outputList = [];
                for (i = 0; i < Mappings.length; i++) {
                    if (outputList[Mappings[i].outputIndex] == undefined) {
                        outputList[Mappings[i].outputIndex] = [];
                    }
                    var frameList = outputList[Mappings[i].outputIndex].find(function (e) {
                        return e.frameSize === this.frameSize;
                    }, Mappings[i]);
                    if (!frameList) {
                        frameList = {
                            'frameSize': Mappings[i].frameSize,
                            'featureList': undefined
                        };
                        outputList[Mappings[i].outputIndex].push(frameList);
                    }
                    frameList.featureList = recursiveFind(Mappings[i].getFeatureList());
                }
                Sender.updateFeatures(outputList);
            }

            this.requestFeatures = function (requestorInstance, featureObject) {
                var map = Mappings.find(function (e) {
                    return (e.outputIndex == this.outputIndex && e.frameSize == this.frameSize);
                }, featureObject);
                if (!map) {
                    map = {
                        'outputIndex': featureObject.outputIndex,
                        'frameSize': featureObject.frameSize,
                        'requestors': [],
                        'getFeatureList': function () {
                            var F = [],
                                i;
                            for (i = 0; i < this.requestors.length; i++) {
                                F = F.concat(this.requestors[i].getFeatureList());
                            }
                            return F;
                        }
                    }
                    Mappings.push(map);
                }
                var requestor = map.requestors.find(function (e) {
                    return e.getRequestorInstance() === this;
                }, requestorInstance);
                if (!requestor) {
                    requestor = new RequestorMap(requestorInstance);
                    map.requestors.push(requestor);
                }
                requestor.addFeatures(featureObject);
                updateSender();
            }

            this.findFrameMap = function (outputIndex, frameSize) {
                return Mappings.find(function (e) {
                    return (e.outputIndex === outputIndex && e.frameSize === frameSize);
                });
            }

            this.cancelFeatures = function (requestorInstance, featureObject) {
                if (featureObject === undefined) {
                    Mappings.forEach(function (map) {
                        var requestorIndex = map.requestors.findIndex(function (e) {
                            return e.getRequestorInstance() === requestorInstance;
                        });
                        if (requestorIndex >= 0) {
                            map.requestors.splice(requestorIndex, 1);
                        }
                    });
                } else {
                    var map = Mappings.find(function (e) {
                        return (e.outputIndex == this.outputIndex && e.frameSize == this.frameSize);
                    }, featureObject);
                    if (!map) {
                        return;
                    }
                    var requestor = map.requestors.find(function (e) {
                        return e.getRequestorInstance() === this;
                    }, requestorInstance);
                    if (!requestor) {
                        return;
                    }
                    requestor.deleteFeatures(featureObject);
                }
                updateSender();
            }
        }
        var RequestorMap = function (pluginInstance) {
            var Features = [];
            var Receiver = pluginInstance.node.featureMap.Receiver;
            this.getRequestorInstance = function () {
                return pluginInstance;
            }

            function recursivelyAddFeatures(rootArray, featureObject) {
                var i;
                for (i = 0; i < featureObject.length; i++) {
                    // Check we have not already listed the feature
                    var featureNode = rootArray.find(function (e) {
                        return e.name === this.name;
                    }, featureObject[i]);
                    if (!featureNode) {
                        featureNode = {
                            'name': featureObject[i].name,
                            'parameters': featureObject[i].parameters,
                            'features': []
                        }
                        rootArray.push(featureNode);
                    }
                    if (featureObject[i].features !== undefined && featureObject[i].features.length > 0) {
                        recursivelyAddFeatures(featureNode.features, featureObject[i].features);
                    }
                }
            }

            function recursivelyDeleteFeatures(rootArray, featureObject) {
                var l = featureObject.length,
                    i;
                for (i = 0; i < l; i++) {
                    // Find the feature
                    var index = rootArray.find(function (e) {
                        return e.name === this.name;
                    }, featureObject[i]);
                    if (index >= 0) {
                        if (featureObject[index].features && featureObject[index].features.length > 0) {
                            recursivelyDeleteFeatures(rootArray[index].features, featureObject[index].features);
                        } else {
                            Features.splice(index, 0);
                        }
                    }

                }
            }

            this.addFeatures = function (featureObject) {
                recursivelyAddFeatures(Features, featureObject.features);
            }

            this.deleteFeatures = function (featureObject) {
                recursivelyDeleteFeatures(Features, featureObject.features);
            }

            this.getFeatureList = function () {
                return Features;
            }

            this.postFeatures = function (featureObject) {
                var message = {
                        'plugin': featureObject.plugin,
                        'outputIndex': featureObject.outputIndex,
                        'frameSize': featureObject.frameSize,
                        'features': {
                            'numberOfChannels': featureObject.results.numberOfChannels,
                            'results': []
                        }
                    },
                    i;

                function recursivePostFeatures(rootNode, resultsList, FeatureList) {
                    // Add the results tree where necessary
                    var i, param;
                    for (param in resultsList) {
                        if (resultsList.hasOwnProperty(param)) {
                            var node = FeatureList.find(function (e) {
                                return e.name == param;
                            });
                            if (node) {
                                if (resultsList[param].constructor === Object && node.results) {
                                    rootNode[param] = {};
                                    recursivePostFeatures(rootNode[param], resultsList[param], node.results);
                                } else {
                                    rootNode[param] = resultsList[param];
                                }
                            }
                        }
                    }
                }
                // Perform recursive map for each channel
                for (i = 0; i < featureObject.results.numberOfChannels; i++) {
                    message.features.results[i] = {};
                    recursivePostFeatures(message.features.results[i], featureObject.results.results[i].results, Features);
                }
                pluginInstance.node.featureMap.Receiver.postFeatures(message);
            }
        }

        function findSourceIndex(Sender) {
            return Mappings.findIndex(function (e) {
                return e.getSender() === this;
            }, Sender);
        }

        // GENERAL INTERFACE
        this.createSourceMap = function (Sender, pluginInstance) {
            var node = new SourceMap(Sender, pluginInstance);
            Mappings.push(node);
            return node;
        };
        this.deleteSourceMap = function (Sender) {
            var index = findSourceIndex(Sender);
            if (index === -1) {
                throw ("Could not find the source map for the plugin");
            }
            Mappings.splice(index, 1);
        };

        this.getPluginSender = function (plugin) {
            if (plugin.constructor == PluginInstance) {
                plugin = plugin.node;
            }
            return plugin.featureMap.Sender;
        }

        this.requestFeatures = function (requestor, source, featureObject) {
            if (requestor.constructor != PluginInstance) {
                requestor = requestor.pluginInstance;
            }
            // Get the source map

            var sourceMap = Mappings[findSourceIndex(source)];
            if (!sourceMap) {
                sourceMap = Mappings[findSourceIndex(this.getPluginSender(source))];
                if (!sourceMap) {
                    throw ("Could not locate source map");
                }
            }
            sourceMap.requestFeatures(requestor, featureObject);
        };
        this.deleteFeatures = function (requestor, source, featureObject) {
            if (requestor.constructor !== PluginInstance) {
                requestor = requestor.pluginInstance;
            }
            if (source === undefined) {
                Mappings.forEach(function (sourceMap) {
                    sourceMap.cancelFeatures(requestor);
                });
            } else {
                // Get the source map
                var sourceMap = Mappings[findSourceIndex(source)];
                if (!sourceMap) {
                    sourceMap = Mappings[findSourceIndex(this.getPluginSender(source))];
                    if (!sourceMap) {
                        throw ("Could not locate source map");
                    }
                }
                sourceMap.cancelFeatures(requestor, featureObject);
            }
        };
        this.getFeatureList = function (requestor, source) {};
        this.postFeatures = function (featureObject) {
            // Receive from the Sender objects
            // Trigger distributed search for results transmission

            // First get the instance mapping for output/frame
            var source = Mappings[findSourceIndex(featureObject.plugin)];
            if (!source) {
                source = Mappings[findSourceIndex(this.getPluginSender(featureObject.plugin))];
                if (!source) {
                    throw ("Plugin Instance not loaded!");
                }
            }
            var frameMap = source.findFrameMap(featureObject.outputIndex, featureObject.frameSize);

            // Send the feature object to the RequestorMap object to handle comms
            frameMap.requestors.forEach(function (e) {
                e.postFeatures(this);
            }, featureObject);

        };
    };

    this.FeatureMap = new this.FeatureMap();
    Object.defineProperty(this.FeatureMap, "factory", {
        'value': this
    });

    var stores = [];

    this.createStore = function (storeName) {
        var node = new LinkedStore(storeName);
        stores.push(node);
        return node;
    }

    this.getStores = function () {
        return stores;
    }

    this.findStore = function (storeName) {
        return stores.find(function (a) {
            return a.name == storeName;
        });
    }

    // Build the default Stores
    this.SessionData = new LinkedStore("Session");
    this.UserData = new LinkedStore("User");

    // Created for the input of each SubFactory plugin chain
    var SubFactoryFeatureSender = function (owner, FactoryFeatureMap) {
        var OutputNode = function (parent, output) {
            var extractors = [];
            var Extractor = function (output, frameSize) {
                this.extractor = output.context.createAnalyser();
                this.extractor.fftSize = frameSize;
                output.connect(this.extractor);
                this.features = [];
                Object.defineProperty(this, "frameSize", {
                    'value': frameSize
                });

                function onaudiocallback(data) {
                    //this == Extractor
                    recursivelyProcess(data, this.features);
                    this.postFeatures(data.length, JSON.parse(data.toJSON()));
                };

                this.setFeatures = function (featureList) {
                    this.features = featureList;
                    if (this.features.length == 0) {
                        this.extractor.clearCallback();
                    } else {
                        this.extractor.featureCallback(onaudiocallback, this);
                    }
                }
            }
            var WorkerExtractor = function (output, frameSize) {
                function onaudiocallback(e) {
                    var c, frames = [];
                    for (c = 0; c < e.inputBuffer.numberOfChannels; c++) {
                        frames[c] = e.inputBuffer.getChannelData(c);
                    }
                    worker.postMessage({
                        'state': 2,
                        'frames': frames
                    });
                }

                function response(msg) {
                    this.postFeatures(frameSize, msg.data.response);
                };

                var worker = new Worker("jsap/feature-worker.js");
                worker.onerror = function (e) {
                    console.error(e);
                }

                this.setFeatures = function (featureList) {
                    var self = this;
                    var configMessage = {
                        'state': 1,
                        'sampleRate': output.context.sampleRate,
                        'featureList': featureList,
                        'numChannels': output.numberOfOutputs,
                        'frameSize': this.frameSize
                    }
                    this.features = featureList;
                    if (featureList && featureList.length > 0) {
                        worker.onmessage = function (e) {
                            if (e.data.state == 1) {
                                worker.onmessage = response.bind(self);
                                self.extractor.onaudioprocess = onaudiocallback.bind(self);
                            } else {
                                worker.postMessage(configMessage);
                            }
                        }
                        worker.postMessage({
                            'state': 0
                        });
                    } else {
                        this.extractor.onaudioprocess = undefined;
                    }

                }

                this.extractor = output.context.createScriptProcessor(frameSize, output.numberOfOutputs, 1);
                output.connect(this.extractor);
                this.extractor.connect(output.context.destination);

                Object.defineProperty(this, "frameSize", {
                    'value': frameSize
                });
            }
            this.addExtractor = function (frameSize) {
                var obj;
                if (window.Worker) {
                    obj = new WorkerExtractor(output, frameSize);
                } else {
                    obj = new Extractor(output, frameSize);
                }
                extractors.push(obj);
                Object.defineProperty(obj, "postFeatures", {
                    'value': function (frameSize, resultsJSON) {
                        var obj = {
                            'outputIndex': 0,
                            'frameSize': frameSize,
                            'results': resultsJSON
                        }
                        this.postFeatures(obj);
                    }.bind(this)
                });
                return obj;
            };
            this.findExtractor = function (frameSize) {
                var check = frameSize;
                return extractors.find(function (e) {
                    // This MUST be == NOT ===
                    return e.frameSize == check;
                });
            };
            this.deleteExtractor = function (frameSize) {};
        }
        var outputNodes;
        this.updateFeatures = function (featureObject) {
            var o;
            for (o = 0; o < featureObject.length; o++) {
                if (outputNodes === undefined) {
                    if (o > 1) {
                        throw ("Requested an output that does not exist");
                    }
                    outputNodes = new OutputNode(owner, owner.chainStart);
                    Object.defineProperty(outputNodes, "postFeatures", {
                        'value': function (resultObject) {
                            this.postFeatures(resultObject);
                        }.bind(this)
                    });
                }
                var si;
                for (si = 0; si < featureObject[o].length; si++) {
                    var extractor = outputNodes.findExtractor(featureObject[o][si].frameSize);
                    if (!extractor) {
                        extractor = outputNodes.addExtractor(featureObject[o][si].frameSize);
                    }
                    extractor.setFeatures(featureObject[o][si].featureList);
                }
            }
        }

        this.postFeatures = function (featureObject) {
            /*
                Called by the individual extractor instances:
                featureObject = {'frameSize': frameSize,
                'outputIndex': outputIndex,
                'results':[]}
            */
            FactoryFeatureMap.postFeatures({
                'plugin': this,
                'outputIndex': featureObject.outputIndex,
                'frameSize': featureObject.frameSize,
                'results': featureObject.results
            });
        }

        // Send to Factory
        FactoryFeatureMap.createSourceMap(this, undefined);
    }

    var PluginSubFactory = function (PluginFactory, chainStart, chainStop) {

        var plugin_list = [],
            pluginChainStart = chainStart,
            pluginChainStop = chainStop,
            factoryName = "",
            state = 1,
            chainStartFeature = PluginFactory.context.createAnalyser(),
            semanticStores = [];
        this.parent = PluginFactory;
        pluginChainStart.disconnect();
        pluginChainStart.connect(chainStartFeature);
        pluginChainStart.connect(chainStop);

        this.TrackData = new LinkedStore("Track");
        this.PluginData = new LinkedStore("Plugin");

        this.featureSender = new SubFactoryFeatureSender(this, this.parent.FeatureMap);

        this.getFeatureChain = function () {

        }

        function rebuild() {
            var i = 0,
                l = plugin_list.length - 1;
            while (i < l) {
                var currentNode = plugin_list[i++];
                var nextNode = plugin_list[i];
                currentNode.reconnect(nextNode);
            }
        }

        function isolate() {
            plugin_list.forEach(function (e) {
                e.disconnect();
            })
        }

        function cutChain() {
            if (plugin_list.length > 0) {
                pluginChainStart.disconnect(plugin_list[0].node.getInputs()[0]);
                plugin_list[plugin_list.length - 1].node.getOutputs()[0].disconnect(pluginChainStop);
            } else {
                pluginChainStart.disconnect(pluginChainStop);
            }
        }

        function joinChain() {
            if (plugin_list.length > 0) {
                pluginChainStart.connect(plugin_list[0].node.getInputs()[0]);
                plugin_list[plugin_list.length - 1].node.getOutputs()[0].connect(pluginChainStop);
            } else {
                pluginChainStart.connect(pluginChainStop);
            }
        }

        this.getPrototypes = function () {
            return this.parent.getPrototypes();
        };

        this.getFactory = function () {
            return this.parent;
        };

        this.destroy = function () {
            var i;
            for (i = 0; i < plugin_list.length; i++) {
                this.destroyPlugin(plugin_list[i]);
            }
            pluginChainStart.disconnect();
            pluginChainStart.connect(pluginChainStop);
        };

        // Plugin creation / destruction

        this.createPlugin = function (prototypeObject) {
            var node, last_node;
            if (state === 0) {
                throw ("SubFactory has been destroyed! Cannot add new plugins");
            }
            cutChain();
            node = prototypeObject.createPluginInstance(this);
            Object.defineProperties(node, {
                'TrackData': {
                    value: this.TrackData
                }
            });
            plugin_list.push(node);
            isolate();
            rebuild();
            joinChain();
            return node;
        };

        this.destroyPlugin = function (plugin_object) {
            if (state === 0) {
                return;
            }
            var index = this.getPluginIndex(plugin_object);
            if (index >= 0) {
                cutChain();
                plugin_object.node.stop();
                plugin_object.node.deconstruct();
                plugin_list.splice(index, 1);
                this.parent.deletePlugin(plugin_object.id);
                isolate();
                rebuild();
                joinChain();
            }
        };

        this.getPlugins = function () {
            return plugin_list;
        };

        this.getAllPlugins = function () {
            return this.parent.getAllPluginsObject();
        };

        this.getPluginIndex = function (plugin_object) {
            if (state === 0) {
                return;
            }
            var index = plugin_list.findIndex(function (element, index, array) {
                if (element === this) {
                    return true;
                }
                return false;
            }, plugin_object);
            return index;
        };

        this.movePlugin = function (plugin_object, new_index) {
            if (state === 0) {
                return;
            }
            var obj, index = this.getPluginIndex(plugin_object),
                holdLow, holdHigh, i;
            if (index >= 0) {
                cutChain();
                isolate();
                obj = plugin_list.splice(index, 1);
                if (new_index === 0) {
                    plugin_list = obj.concat(plugin_list);
                } else if (new_index >= plugin_list.length) {
                    plugin_list = plugin_list.concat(obj);
                } else {
                    holdLow = plugin_list.slice(0, new_index);
                    holdHigh = plugin_list.slice(new_index);
                    plugin_list = holdLow.concat(obj.concat(holdHigh));
                }
                rebuild();
                joinChain();
            }
        };

        Object.defineProperty(this, "name", {
            get: function () {
                return factoryName;
            },
            set: function (name) {
                if (typeof name === "string") {
                    factoryName = name;
                }
                return factoryName;
            }
        });
        Object.defineProperties(this, {
            'chainStart': {
                'value': chainStart
            },
            'chainStop': {
                'value': chainStop
            }
        });
    };
};
