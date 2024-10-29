import {HtmlReporterOptions, ReportData} from "./types.js";
import nunjucks from "nunjucks";
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration.js';
import {SuiteStats, TestStats} from "@wdio/reporter";
import util from 'util';
import fs from 'fs-extra';
import _ from 'lodash';
import path from 'node:path';
import encode from './encode.js' ;
import logger from '@wdio/logger' ;
import url from 'node:url';

dayjs.extend(duration);


class HtmlGenerator {
    private static LOG = logger('HtmlGenerator') ;
    static writeJson(jsonFile:string , stringified:string , reportOptions:HtmlReporterOptions, reportData: ReportData) {
        fs.outputFileSync(jsonFile, stringified);
       HtmlGenerator.LOG.info("Json write completed: " + jsonFile );
    }

    static async htmlOutput(reportOptions: HtmlReporterOptions, reportData: ReportData) {

       HtmlGenerator.LOG.info('Html Generation started')


        const specFileReferences: string[] = [];
        try {
            const rootdirname = path.dirname(url.fileURLToPath(new URL('.', import.meta.url)));
            HtmlGenerator.LOG.info("Html Generation started in " + rootdirname);
            const templateDir = rootdirname + '/templates/';
            let environment = nunjucks.configure([templateDir ], { // set folders with templates
                autoescape: true,
            });

            environment.addGlobal('renderImage', function (screenshotFile: string, screenshotPath: string) {
                // occurs when there is an image to render
                let relPath ;
                try {

                    if (!fs.existsSync(screenshotFile)) {
                        if (screenshotPath) {
                            screenshotFile = `${screenshotPath}/${screenshotFile}`;
                        } else {
                            screenshotFile = `${screenshotFile}`;
                        }
                    }
                    if (!fs.existsSync(screenshotFile)) {
                        HtmlGenerator.LOG.error("renderImage: file doesnt exist: " + relPath );
                    }

                    relPath =  path.relative(reportOptions.outputDir,screenshotFile);
                    if (reportOptions.linkScreenshots) {
                       HtmlGenerator.LOG.info("renderImage: Screenshot Relative Path: " + relPath);
                        return relPath ;
                    } else {
                        return encode(path.resolve(screenshotFile));
                    }
                } catch(err) {
                   HtmlGenerator.LOG.error("renderImage: Error processing file: " + relPath + " " + err);
                    return relPath;
                }
            });
            environment.addGlobal('renderVideo', function (videoCaptureFile: string) {

                let relPath =  path.relative(reportOptions.outputDir,videoCaptureFile).split(path.sep).join(path.posix.sep);
                try {
                   HtmlGenerator.LOG.debug("Video Relative Path: " + relPath);
                    return relPath ;
                } catch(err) {
                   HtmlGenerator.LOG.error("renderVideo: Error processing file: " + relPath + " " + err);
                    return relPath;
                }
            });
            environment.addGlobal('displaySpecFile', (suiteInfo:SuiteStats) => {
                if (suiteInfo && suiteInfo.file) {
                    if (specFileReferences && !specFileReferences.includes(suiteInfo.file)) {
                        specFileReferences.push(suiteInfo.file)
                        return true;
                    }
                }
                return false ;
            });

            environment.addGlobal('formatSpecFile', (suiteInfo:SuiteStats) => {
                // Display file path of spec
                let specFile = `${suiteInfo.file.replace(process.cwd(), '')}`
                return specFile;
            });

            environment.addGlobal('testStateColour', (testInfo:TestStats) => {
                if (testInfo.state === 'passed') {
                    return 'test-pass';
                } else if (testInfo.state === 'failed') {
                    return 'test-fail';
                } else if (testInfo.state === 'pending') {
                    return 'test-pending';
                } else if (testInfo.state === 'skipped') {
                    return 'test-skipped';
                }
            });

            environment.addGlobal('testStateClass', (testInfo:TestStats) => {
                if (testInfo.state === 'passed') {
                    return 'success';
                } else if (testInfo.state === 'failed') {
                    return 'error';
                } else if (testInfo.state === 'pending') {
                    return 'pending';
                } else if (testInfo.state === 'skipped') {
                    return 'skipped';
                }
            });
            environment.addGlobal('testStateIcon', (testInfo:TestStats) => {
                if (testInfo.state === 'passed') {
                    return '&#10004;';
                } else if (testInfo.state === 'failed') {
                    return '&#10006;';
                } else if (testInfo.state === 'pending') {
                    return '&#10004;';
                } else if (testInfo.state === 'skipped') {
                    return '&#10034;';
                }
            });
            environment.addGlobal('suiteStateColour', (suiteInfo:SuiteStats) => {
                if (suiteInfo.type.includes('feature')) {
                    return 'suite-feature';
                }
                if (!suiteInfo || !suiteInfo.tests) {
                    return 'suite-unknown';
                }
                let numTests = Object.keys(suiteInfo.tests).length;
                let tests = suiteInfo.tests;

                _.values(tests).find((test: TestStats) => {
                    if (test.state === "pending") {
                        --numTests;
                    }
                });

                let fail = _.values(tests).find((test: TestStats) => {
                    return test.state === 'failed';
                })
                if (fail != null) {
                    return 'suite-fail';
                }

                let passes = _.values(tests).filter((test: TestStats) => {
                    return test.state === 'passed';
                })
                if (passes.length === numTests && numTests > 0) {
                    return 'suite-pass';
                }

                //skipped is the lowest priority check
                let skipped = _.values(tests).find((test: TestStats) => {
                    return test.state === 'skipped';
                })
                if (skipped != null) {
                    return 'suite-pending';
                }

                return 'suite-unknown'
            });

            environment.addGlobal('humanizeDuration', (duration:number) => {
                return dayjs.duration(duration, "milliseconds").format('HH:mm:ss.SSS');
            });

            environment.addGlobal('ifCollapseTests', (text:string) => {
                return reportOptions.collapseTests;
            });

            environment.addGlobal('ifCollapseSuites', (text:string) => {
                return reportOptions.collapseSuites;
            });

            environment.addGlobal('logClass', (text:string) => {
                if (text && text.includes('Test Iteration')) {
                    return "test-iteration";
                } else {
                    return "log-output";
                }
            });

            if (fs.pathExistsSync(reportOptions.outputDir)) {
                try
                {
                    let html = nunjucks.render("report.html", reportData);
                    fs.outputFileSync(reportData.reportFile, html);

                    let sortedSuites = reportData.suites.sort((suite1, suite2) => {
                        let first = dayjs.utc(suite1.start);
                        let second = dayjs.utc(suite2.start);
                        if (first.isAfter(second)) {
                            return 1;
                        }
                        else if (first.isBefore(second)) {
                            return -1;
                        }
                        return 0;
                    })

                    for (let i = 0; i < sortedSuites.length; i++) {
                        let suite = sortedSuites[i];
                        
                        try {
                            const suiteHtml = await new Promise((resolve, reject) => {
                                nunjucks.render("suite.html", { suite }, (err, result) => {
                                    if (err) {
                                        HtmlGenerator.LOG.error('Error rendering template:', err);
                                        reject(err);
                                    } else {
                                        resolve(result);
                                    }
                                });
                            });
                    
                            await fs.appendFile(reportData.reportFile, suiteHtml);
                            HtmlGenerator.LOG.info(`Appended suite: ${suite.title}`);
                        } catch (error) {
                            HtmlGenerator.LOG.error('Error processing suite:', error);
                        }
                    }

                    if (fs.pathExistsSync(reportOptions.outputDir))
                    {
                        const copyFile = util.promisify(fs.copyFile);

                        const reportCss = rootdirname + '/css/report-styles.css';
                        const destCss = reportOptions.outputDir + '/report-styles.css';
                        await copyFile(reportCss, destCss);

                        const cssFont = rootdirname + '/css/glyphicons-halflings-regular.woff';
                        const fontDest = reportOptions.outputDir + '/glyphicons-halflings-regular.woff';
                        await copyFile(cssFont, fontDest);
                    }
                } catch (error) {
                   HtmlGenerator.LOG.error("Html Generation failed: " + error);
                }
            }
           HtmlGenerator.LOG.info("Html Generation Completed");
        } catch (ex) {
           HtmlGenerator.LOG.error("Html Generation processing ended in error: " + ex);
        }
    }
}

export default HtmlGenerator;