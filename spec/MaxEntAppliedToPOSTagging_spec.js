/*
  Test of Classifier based on POS tagging
  Copyright (C) 2018 Hugo W.L. ter Doest

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

var fs = require('fs');

var base_folder_test_data = './spec/test_data/';
var brownCorpusFile = base_folder_test_data + 'browntag_nolines_excerpt.txt';
var sampleFile = base_folder_test_data + 'sample.json';
var classifierFile = base_folder_test_data + 'classifier.json';

var natural = require('../lib/natural');
var Sample = natural.Sample;
var Classifier = natural.MaxEntClassifier;
var Feature = natural.Feature;
var FeatureSet = natural.FeatureSet;
var Context = natural.Context;

// Load some classes specific to part of speech tagging
var Corpus = natural.Corpus; //require('./Corpus');
var POS_Element = natural.POS_Element;
var Tagger = natural.BrillPOSTagger; //require('./POS_Tagger');

var BROWN = 1;
var nrIterations = 1;
var minImprovement = 0.01;
var trainCorpusSize = 20; // percentage

// Structure of the event space
// - Classes are possible tags
// - A context consists of a window of words and a window of tags

function applyClassifierToTestCorpus(testCorpus, tagger, classifier) {
  var totalWords = 0;
  var correctyTaggedLexicon = 0;
  var correctlyTaggedMaxEnt = 0;

  testCorpus.sentences.forEach(function(sentence){
    // Put the words of the sentence in an array
    var s = sentence.taggedWords.map(function(token) {
      return token.token;
    });

    // Use the lexicon to tag the sentence
    var taggedSentence = tagger.tagWithLexicon(s);
    // Count the right tags
    sentence.taggedWords.forEach(function(token, i) {
      totalWords++;
      if (token.tag === taggedSentence[i][1]) {
        correctyTaggedLexicon++;
      }
    });

    // Classify tags using maxent
    taggedSentence.forEach(function(taggedWord, index) {

      // Create context for classication
      var context = new Context({
          wordWindow: {},
          tagWindow: {}
      });
      // Current wordWindow
      context.data.wordWindow["0"] = taggedWord[0];
      // Previous bigram
      if (index > 1) {
        context.data.tagWindow["-2"] = taggedSentence[index - 2][1];
        //context.data.tagWindow["-1"] = taggedSentence[index - 1][1];
      }
      // Left bigram
      if (index > 0) {
        context.data.tagWindow["-1"] = taggedSentence[index - 1][1];
        //context.data.tagWindow["0"] = taggedSentence[index][1];
      }
      // Right bigram
      if (index < sentence.length - 1) {
        //context.data.tagWindow["0"] = taggedSentence[index][1];
        context.data.tagWindow["1"] = taggedSentence[index + 1][1];
      }
      // Next bigram
      if (index < sentence.length - 2) {
        //context.data.tagWindow["1"] = taggedSentence[index + 1][1];
        context.data.tagWindow["2"] = taggedSentence[index + 2][1];
      }
      // Left bigram words
      if (index > 0) {
        context.data.wordWindow["-1"] = taggedSentence[index - 1][0];
        //context.data.wordWindow["0"] = taggedSentence[index][0];
      }
      // Right bigram words
      if (index < sentence.length - 1) {
        //context.data.wordWindow["0"] = taggedSentence[index][0];
        context.data.wordWindow["1"] = taggedSentence[index + 1][0];
      }

      // Classify using maximum entropy model
      var tag = classifier.classify(context);

      if (tag === "") {
        tag = tagger.lexicon.tagWordWithDefaults(context.data.wordWindow["0"])
      }

      // Collect stats
      if (tag === sentence.taggedWords[index].tag) {
        // Correctly tagged
        correctlyTaggedMaxEnt++;
      }
      console.log("(word, classification, right tag): " + "(" + taggedWord[0] +
        ", " + tag + ", " + sentence.taggedWords[index].tag + ")");
    });
  });

  console.log("Number of words tagged: " + totalWords);
  console.log("Percentage correctly tagged lexicon: " + correctyTaggedLexicon/totalWords * 100 + "%");
  console.log("Percentage correctly tagged maxent:  " + correctlyTaggedMaxEnt/totalWords * 100 + "%");
}

describe("Maximum Entropy Classifier applied to POS tagging", function() {
  // Prepare the train and test corpus
  var data = fs.readFileSync(brownCorpusFile, 'utf8');
  var corpus = new Corpus(data, BROWN);
  var trainAndTestCorpus = corpus.splitInTrainAndTest(trainCorpusSize);
  var trainCorpus = trainAndTestCorpus[0];
  var testCorpus = trainAndTestCorpus[1];
  var sample = null;
  var classifier = null;
  var featureSet = null;
  var lexicon = null;
  var tagger = null;

  // Generate sample from trainCorpus
  it("generates a sample from a corpus", function() {
    sample = trainCorpus.generateSample();
    expect(sample.size()).toBeGreaterThan(0);
  });

  it("saves a sample to a file", function(done) {
    sample.save(sampleFile, function(err, sample) {
      if (err) {
        console.log(err);
        expect(false).toBe(true);
      }
      else {
        console.log("Sample saved to "  + sampleFile);
        expect(fs.existsSync(sampleFile)).toBe(true);
      }
      done();
    });
  });

  var newSample = null;
  it("loads a sample from a file", function(done) {
    sample.load(sampleFile, POS_Element, function(err, s) {
      if (err) {
        console.log(err);
        expect(false).toBe(true);
      }
      else {
        console.log("Sample loaded from "  + sampleFile);
        //expect(s.size()).toBeEqual(sample.size());
        newSample = s;
      }
      done();
    });
    if (newSample) {
      expect(newSample.size()).toBeEqual(sample.size());
      sample = newSample;
    }
  });


  it ("generates a set of features from the sample", function() {
    featureSet = new FeatureSet();
    sample.generateFeatures(featureSet);
    expect(featureSet.size()).toBeGreaterThan(0);
    console.log("Number of features: " + featureSet.size());
    console.log(featureSet.prettyPrint());
  });

  it("analyses the sample", function() {
    trainCorpus.analyse();
    lexicon = trainCorpus.buildLexicon();
    expect(lexicon.size()).toBeGreaterThan(0);
  });

  it("trains the maximum entropy classifier", function() {
    classifier = new Classifier(featureSet, sample);
    console.log("Classifier created");
    classifier.train(nrIterations, minImprovement);
    console.log("Checksum: " + classifier.p.checkSum());
  });

  it ("saves the classifier to a file", function(done) {
    classifier.save(classifierFile, function(err, classifier) {
      if (err) {
        console.log(err);
        expect(false).toBe(true);
      }
      else {
        console.log("Classifier saved to "  + classifierFile);
        expect(fs.existsSync(classifierFile)).toBe(true);
      }
      done();
    });
  });

  var newClassifier = null;
  it("loads the classifier from a file", function(done) {
    classifier.load(classifierFile, POS_Element, function(err, c) {
      if (err) {
        console.log(err);
        expect(false).toBe(true);
      }
      else {
        console.log("Sample loaded from "  + sampleFile);
        newClassifier = c;
      }
      done();
    });
    if (newClassifier) {
      expect(newClassifier.sample.size()).toEqual(classifier.sample.size());
      classifier = newClassifier;
    }
  });

  it("compares maximum entropy based POS tagger to lexicon-based tagger", function() {
      // Test the classifier against the test corpus
      //lexicon.setDefaultCategories('NN', 'NP');
      tagger = new Tagger(lexicon);
      applyClassifierToTestCorpus(testCorpus, tagger, classifier);
  });
});
