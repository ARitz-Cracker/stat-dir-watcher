/* eslint-disable prefer-arrow-callback */
/* eslint-disable no-magic-numbers */
const chai = require("chai");
chai.use(require("chai-as-promised"));
chai.use(require("chai-eventemitter"));
const expect = chai.expect;
describe("advanced file watcher (~advanced)", function(){
	/* This thing is in beta because I don't have the time to write proper tests right now, though otherwise the api is
	   "stable" and when I do write tests or fix bugs, I'd like any 1.0.0+ releases to be downloaded automatically when
	   it's released, as 0.9 -> 1.0 doesn't work in semantic versioning */
	it("works");
});
