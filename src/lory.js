/* eslint-disable */
/* globals jQuery */

// XXX: could also remove all rewind code & slides to scroll code if it's never used..

import detectPrefixes from './utils/detect-prefixes.js';
import supportsPassive from './utils/detect-supportsPassive';
import dispatchEvent from './utils/dispatch-event.js';
import defaults from './defaults.js';

const slice = Array.prototype.slice;

export function lory (slider, opts) {
    let position;
    let slidesWidth;
    let frameWidth;
    let slides;
    let slidesFitInFrame;
    let slideWidths;

    /**
     * slider DOM elements
     */
    let frame;
    let slideContainer;
    let prevCtrl;
    let nextCtrl;

    let prefixes;
    let transitionEndCallback;
    let disabledClass = 'disabled';
    let morePrev;
    let moreNext;
    let touchControl;

    let index   = 0;
    let options = {};
    let touchEventParams = supportsPassive() ? { passive: true } : false;

    /**
     * if object is jQuery convert to native DOM element
     */
    if (typeof jQuery !== 'undefined' && slider instanceof jQuery) {
        slider = slider[0];
    }

    /**
     * private
     * set active class to element which is the current slide
     */
    function setActiveElement (slides, currentIndex) {
        const {classNameActiveSlide} = options;

        slides.forEach((element, index) => {
            if (element.classList.contains(classNameActiveSlide)) {
                element.classList.remove(classNameActiveSlide);
            }
        });

        slides[currentIndex].classList.add(classNameActiveSlide);
    }

    /**
     * private
     * setupInfinite: function to setup if infinite is set
     *
     * @param  {array} slideArray
     * @return {array} array of updated slideContainer elements
     */
    function setupInfinite (slideArray) {
        const {infinite} = options;

        const front = slideArray.slice(0, infinite);
        const back  = slideArray.slice(slideArray.length - infinite, slideArray.length);

        front.forEach(function (element) {
            const cloned = element.cloneNode(true);

            slideContainer.appendChild(cloned);
        });

        back.reverse()
            .forEach(function (element) {
                const cloned = element.cloneNode(true);

                slideContainer.insertBefore(cloned, slideContainer.firstChild);
            });

        return slice.call(slideContainer.children);
    }

    /**
     * [dispatchSliderEvent description]
     * @return {[type]} [description]
     */
    function dispatchSliderEvent (phase, type, detail) {
        dispatchEvent(slider, `${phase}.lory.${type}`, detail);
    }

    /**
     * translates to a given position in a given time in milliseconds
     *
     * @to        {number} number in pixels where to translate to
     * @duration  {number} time in milliseconds for the transistion
     * @ease      {string} easing css property
     */
    function translate (to, duration, ease) {
        const style = slideContainer && slideContainer.style;

        if (style) {
            style[prefixes.transition + 'TimingFunction'] = ease;
            style[prefixes.transition + 'Duration'] = duration + 'ms';
            style[prefixes.transform] = 'translateX(' + to + 'px)';
        }
    }

    function margin_size(margin) {
        // only works on pixel (px) values
        return /px$/.test(margin) ? parseFloat(margin) : 0;
    }

    /**
     * returns an element's width (including margins)
     */
    function elementWidth (element) {
        let width = element.getBoundingClientRect().width || element.offsetWidth,
            style = getComputedStyle(element);

        return width + margin_size(style.marginLeft) + margin_size(style.marginRight);
    }

    function getMaxOffset () {
        return Math.round(slidesWidth - frameWidth);
    }

    function getCustomDistance (direction) {
        // intelligently slide to show whatever is slightly obscured + other slides in that direction
        // w/ a margin to prevent the prev/next controls from getting in the way too much
        //
        // assumes nav-links not shown (b/c it doesn't set the index properly but probably fixable)
        // and untested w/ infinite or rewind options

        let distance = 0,
            ctrl_margin = 60,
            obscured_width = 0;

        // have to take into account if a previous transition is still in progress
        let transitionRemaining = Math.abs(position.x) - Math.abs(slideContainer.getBoundingClientRect().left);

        if (!direction) {
            // previous
            let leftmost_obscured,
                reversedSlides = slides.slice(); // shallow copy

            reversedSlides.reverse();

            reversedSlides.forEach(slide => {
                if (!leftmost_obscured) {
                    let r = slide.getBoundingClientRect();

                    if (r.left - transitionRemaining < 0) {
                        leftmost_obscured = slide;
                        distance = frameWidth - (r.right - transitionRemaining);
                        obscured_width = r.width;
                    }
                }
            });
        } else {
            let rightmost_obscured;

            slides.forEach(slide => {
                if (!rightmost_obscured) {
                    let r = slide.getBoundingClientRect();

                    if (r.right - transitionRemaining > frameWidth) {
                        rightmost_obscured = slide;
                        distance = (r.left - transitionRemaining);
                        obscured_width = r.width;
                    }
                }
            });
        }
        if (distance !== 0) {
            if (frameWidth - obscured_width <= ctrl_margin) {
                // almost as wide as the frame so moving the full ctrl_margin wouldn't work
                // instead, just center the obscured slide
                distance -= (frameWidth - obscured_width) / 2;
            } else {
                // extra margin so that prev/next controls don't obsure too much
                // (should probably have this be a options setting)
                distance -= ctrl_margin;
            }
        }
        return Math.round(distance);
    }

    /**
     * slidefunction called by prev, next & touchend
     *
     * determine nextIndex and slide to next postion
     * under restrictions of the defined options
     *
     * @direction  {boolean}
     */
    function slide (nextIndex, direction) {

        if (touchControl) {
            return;
        }

        const {
            slideSpeed,
            slidesToScroll,
            infinite,
            rewind,
            rewindPrev,
            rewindSpeed,
            ease,
            classNameActiveSlide
        } = options;

        let duration = slideSpeed;

        const nextSlide = direction ? index + 1 : index - 1;
        const maxOffset = getMaxOffset();

        if (maxOffset <= 0) {
            // no sliding should be done b/c the slides are fully visible
            return;
        }

        // nextIndex is false for prev() and next()

        let toIndex = typeof nextIndex === 'number';

        if (!toIndex) {
            if (direction) {
              if (infinite && index + (infinite * 2) !== slides.length) {
                  nextIndex = index + (infinite - index % infinite);
              } else {
                  nextIndex = index + slidesToScroll;
              }
            } else {
              if (infinite && index % infinite !== 0) {
                  nextIndex = index - index % infinite;
              } else {
                  nextIndex = index - slidesToScroll;
              }
            }
        }

        nextIndex = Math.min(Math.max(nextIndex, 0), slides.length - 1);

        if (infinite && direction === undefined) {
            nextIndex += infinite;
        }

        if (rewindPrev && Math.abs(position.x) === 0 && direction === false) {
            nextIndex = slides.length - 1;
            duration = rewindSpeed;
        }

        let customNextOffset;

        if (toIndex) {
            // use the default calculation
            customNextOffset = slides[nextIndex].offsetLeft * -1;
        } else {
            let distance;

            if (slidesFitInFrame || infinite || rewind) { // getCustomDistance untested w/ infinite or rewind
                distance = frameWidth;
            } else {
                distance = getCustomDistance(direction);
            }

            if (direction) {
                // next
                distance *= -1;
            }
            customNextOffset = position.x + distance;
        }

        let nextOffset = Math.min(
            Math.max(
                customNextOffset,
                maxOffset * -1
            ),
        0);

        if (rewind && Math.abs(position.x) === maxOffset && direction) {
            nextOffset = 0;
            nextIndex = 0;
            duration = rewindSpeed;
        }

        dispatchSliderEvent('before', 'slide', {
            index,
            nextSlide
        });

        /**
         * translate to the nextOffset by a defined duration and ease function
         */
        translate(nextOffset, duration, ease);

        /**
         * update the position with the next position
         */
        position.x = nextOffset;

        /**
         * update the index with the nextIndex only if
         * the offset of the nextIndex is in the range of the maxOffset
         */
        if (slides[nextIndex].offsetLeft <= maxOffset) {
            index = nextIndex;
        }

        if (infinite && (nextIndex === slides.length - infinite ||
            nextIndex === slides.length - slides.length % infinite || nextIndex === 0)) {
            if (direction) {
                index = infinite;
            }

            if (!direction) {
                index = slides.length - (infinite * 2);
            }

            position.x = slides[index].offsetLeft * -1;

            // this immediately goes to a slide w/o any animation
            transitionEndCallback = function () {
                translate(slides[index].offsetLeft * -1, 0, undefined);
            };
        }

        if (classNameActiveSlide) {
            setActiveElement(slice.call(slides), index);
        }

        updateCtrls(nextIndex, nextOffset);

        dispatchSliderEvent('after', 'slide', {
            currentSlide: index
        });
    }

    function updateCtrls (index, offset) {

        if (options.infinite) {
            // never need to disable the controls
            return;
        }

        const {
            rewind,
            rewindPrev,
        } = options;

        let max_offset = getMaxOffset(),
            actual_offset = Math.round(offset || 0);

        // untested w/ rewind or rewindPrev..
        morePrev = !rewindPrev && (actual_offset === 0 || max_offset <= 0);
        moreNext = (!rewind && (
            (index === slides.length - 1) ||
            (max_offset <= -1 * actual_offset) || // at or over the max offset so the last slide is fully visible
            (max_offset <= 0) // all the slides are visible so no reason to have a next control
        ));

        /**
         * Reset control classes
         */
        if (prevCtrl) {
            prevCtrl.classList.remove(disabledClass);
        }
        if (nextCtrl) {
            nextCtrl.classList.remove(disabledClass);
        }

        /**
         * update classes for next and prev arrows
         * based on user settings
         */
        if (prevCtrl && morePrev) { // index === 0 // using index check doesn't work w/ my smart distance sliding changes
            prevCtrl.classList.add(disabledClass);
        }

        if (nextCtrl && moreNext) {
            nextCtrl.classList.add(disabledClass);
        }
    }

    /**
     * public
     * setup function
     */
    function setup () {
        dispatchSliderEvent('before', 'init');

        prefixes = detectPrefixes();
        options = {...defaults, ...opts};

        const {
            classNameFrame,
            classNameSlideContainer,
            classNamePrevCtrl,
            classNameNextCtrl,
            //enableMouseEvents,
            classNameActiveSlide,
            initialIndex
        } = options;

        touchControl = options.touchControl;

        index = initialIndex;
        frame = slider.getElementsByClassName(classNameFrame)[0];
        slideContainer = frame.getElementsByClassName(classNameSlideContainer)[0];
        prevCtrl = slider.getElementsByClassName(classNamePrevCtrl)[0];
        nextCtrl = slider.getElementsByClassName(classNameNextCtrl)[0];

        position = {
            x: slideContainer.offsetLeft,
            //y: slideContainer.offsetTop // unused
        };

        if (options.infinite) {
            slides = setupInfinite(slice.call(slideContainer.children));
        } else {
            slides = slice.call(slideContainer.children);
        }
        slideContainer.addEventListener(prefixes.transitionEnd, onTransitionEnd);

        reset();

        if (classNameActiveSlide) {
            setActiveElement(slides, index);
        }

        if (prevCtrl && nextCtrl) {
            prevCtrl.addEventListener('click', prev);
            nextCtrl.addEventListener('click', next);
        }

        frame.addEventListener('touchstart', onTouchstart, touchEventParams);

        /*
        if (enableMouseEvents) {
            frame.addEventListener('mousedown', onTouchstart);
            frame.addEventListener('click', onClick);
        }
        */

        options.window.addEventListener('resize', onResize);

        dispatchSliderEvent('after', 'init');
    }

    /**
     * public
     * reset function: called on resize
     */
    function reset () {
        let {infinite, ease, rewindSpeed, rewindOnResize, classNameActiveSlide, initialIndex} = options;

        slidesWidth = elementWidth(slideContainer);
        frameWidth = elementWidth(frame);

        slideWidths = slides.map(slide => elementWidth(slide));

        if (frameWidth === slidesWidth) {
            slidesWidth = slideWidths.reduce((val, slide_width) => val + slide_width, 0);
        }

        let sameWidthSlides = slideWidths.reduce((val, slide_width) => val && slide_width === slideWidths[0], true);

        if (sameWidthSlides) {
            let fit = frameWidth / slideWidths[0];
            slidesFitInFrame = (Math.floor(fit) === fit);
        } else {
            slidesFitInFrame = false;
        }

        if (rewindOnResize) {
            index = initialIndex;
        } else {
            ease = null;
            rewindSpeed = 0;
        }

        let max_offset = getMaxOffset();

        if (max_offset < 0 && options.center) {
            // all the slides fit in view 
            // so make sure they are centered

            let center_translate = Math.abs(max_offset / 2),
                current_left = slideContainer.getBoundingClientRect().left;

            if (Math.abs(current_left - center_translate) > 1) {
                // adjust to center the slides
                translate(center_translate, 0, null);
            }

        } else if (infinite) {
            translate(slides[index + infinite].offsetLeft * -1, 0, null);

            index = index + infinite;
            position.x = slides[index].offsetLeft * -1;
        } else {
            translate(slides[index].offsetLeft * -1, rewindSpeed, ease);
            position.x = slides[index].offsetLeft * -1;
        }

        if (classNameActiveSlide) {
            setActiveElement(slice.call(slides), index);
        }

        updateCtrls(index);
    }

    /**
     * public
     * slideTo: called on clickhandler
     */
    function slideTo (index) {
        slide(index);
    }

    /**
     * public
     * returnIndex function: called on clickhandler
     */
    function returnIndex () {
        return index - options.infinite || 0;
    }

    /**
     * public
     * prev function: called on clickhandler
     */
    function prev () {
        slide(false, false);
    }

    /**
     * public
     * next function: called on clickhandler
     */
    function next () {
        slide(false, true);
    }

    /**
     * public
     * destroy function: called to gracefully destroy the lory instance
     */
    function destroy () {
        dispatchSliderEvent('before', 'destroy');

        // remove event listeners
        slideContainer.removeEventListener(prefixes.transitionEnd, onTransitionEnd);

        frame.removeEventListener('touchstart', onTouchstart, touchEventParams);
        frame.removeEventListener('touchmove', onTouchmove, touchEventParams);
        frame.removeEventListener('touchend', onTouchend);
        /*
        frame.removeEventListener('mousemove', onTouchmove);
        frame.removeEventListener('mousedown', onTouchstart);
        frame.removeEventListener('mouseup', onTouchend);
        frame.removeEventListener('mouseleave', onTouchend);
        */
        frame.removeEventListener('click', onClick);

        options.window.removeEventListener('resize', onResize);

        if (prevCtrl) {
            prevCtrl.removeEventListener('click', prev);
        }

        if (nextCtrl) {
            nextCtrl.removeEventListener('click', next);
        }

        // remove cloned slides if infinite is set
        if (options.infinite) {
            Array.apply(null, Array(options.infinite)).forEach(function () {
                slideContainer.removeChild(slideContainer.firstChild);
                slideContainer.removeChild(slideContainer.lastChild);
            });
        }

        dispatchSliderEvent('after', 'destroy');
    }

    // event handling

    let touchOffset;
    let delta;
    let isScrolling;

    function onTransitionEnd () {
        if (transitionEndCallback) {
            transitionEndCallback();

            transitionEndCallback = undefined;
        }
    }

    function onTouchstart (event) {
        //const {enableMouseEvents} = options;
        const touches = event.touches ? event.touches[0] : event;

        /*
        if (enableMouseEvents) {
            frame.addEventListener('mousemove', onTouchmove);
            frame.addEventListener('mouseup', onTouchend);
            frame.addEventListener('mouseleave', onTouchend);
        }
        */

        frame.addEventListener('touchmove', onTouchmove, touchEventParams);
        frame.addEventListener('touchend', onTouchend);

        const {pageX, pageY} = touches;

        touchOffset = {
            x: pageX,
            y: pageY,
            time: Date.now()
        };

        isScrolling = undefined;

        delta = {};

        dispatchSliderEvent('on', 'touchstart', {
            event
        });
    }

    function onTouchmove (event) {
        const touches = event.touches ? event.touches[0] : event;
        const {pageX, pageY} = touches;

        delta = {
            x: pageX - touchOffset.x,
            y: pageY - touchOffset.y
        };

        if (typeof isScrolling === 'undefined') {
            isScrolling = !!(isScrolling || Math.abs(delta.x) < Math.abs(delta.y));
        }

        if (!isScrolling && touchOffset) {
            translate(position.x + delta.x, 0, null);
        }

        // may be
        dispatchSliderEvent('on', 'touchmove', {
            event
        });
    }

    function onTouchend (event) {
        /**
         * time between touchstart and touchend in milliseconds
         * @duration {number}
         */
        const duration = touchOffset ? Date.now() - touchOffset.time : undefined;

        /**
         * is valid if:
         *
         * -> swipe attempt time is over 300 ms
         * and
         * -> swipe distance is greater than 25px
         * or
         * -> swipe distance is more then a third of the swipe area
         *
         * @isValidSlide {Boolean}
         */
        const isValid = Number(duration) < 300 &&
            Math.abs(delta.x) > 25 ||
            Math.abs(delta.x) > frameWidth / 3;

        /**
         * is out of bounds if:
         *
         * -> index is 0 and delta x is greater than 0
         * or
         * -> index is the last slide and delta is smaller than 0
         *
         * @isOutOfBounds {Boolean}
         */
        /*
        const isOutOfBounds = !index && delta.x > 0 ||
            index === slides.length - 1 && delta.x < 0;
        */

        const direction = delta.x < 0;

        const isOutOfBounds = direction ? moreNext : morePrev;

        if (!isScrolling) {
            if (touchControl) {

                let nextOffset = position.x + delta.x,
                    maxOffset = getMaxOffset();

                if (nextOffset > 0) {
                    // out of bounds on left
                    position.x = 0;
                    translate(position.x, options.snapBackSpeed);
                } else if ((-1 * nextOffset) > maxOffset) {
                    // out of bounds on right
                    if (maxOffset < 0 && !options.center) {
                        // snap back to left alignment
                        maxOffset = 0;
                    }
                    position.x = -1 * maxOffset;
                    translate(position.x, options.snapBackSpeed);
                } else {
                    position.x = nextOffset;
                }

            } else if (!touchControl && isValid && !isOutOfBounds) {
                slide(false, direction);
            } else {
                translate(position.x, options.snapBackSpeed);
            }
        }

        touchOffset = undefined;

        /**
         * remove eventlisteners after swipe attempt
         */
        frame.removeEventListener('touchmove', onTouchmove);
        frame.removeEventListener('touchend', onTouchend);
        /*
        frame.removeEventListener('mousemove', onTouchmove);
        frame.removeEventListener('mouseup', onTouchend);
        frame.removeEventListener('mouseleave', onTouchend);
        */

        dispatchSliderEvent('on', 'touchend', {
            event
        });
    }

    function onClick (event) {
        if (delta.x) {
            event.preventDefault();
        }
    }

    function onResize (event) {
        if (frameWidth !== elementWidth(frame)) {
            reset();

            dispatchSliderEvent('on', 'resize', {
                event
            });
        }
    }

    // trigger initial setup
    setup();

    // expose public api
    return {
        setup,
        reset,
        slideTo,
        returnIndex,
        prev,
        next,
        destroy
    };
}
