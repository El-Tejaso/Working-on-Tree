const assert = (trueVal, msg) => {if (!trueVal) { throw new Error(msg); } };
const unreachable = () => assert(false, "Unreachable code was reached!");

// https://stackoverflow.com/questions/10730309/find-all-text-nodes-in-html-page
const __textNodesUnder = (el) => {
    var n,
        a = [],
        walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    while ((n = walk.nextNode())) a.push(n);
    return a;
}


/** @returns { HTMLElement } */
const __createHtmlElement = (html) => {
    let dst = document.createElement("div");
    dst.innerHTML = html.trim();

    assert(dst.childNodes.length === 1, "print html must only have 1 root node");

    return dst.childNodes[0];
}


// /** @returns {Object<string, HTMLElement>} */
// const createComponent = (mountPoint, html) => {
//     const createDiv = document.createElement("div");
//     createDiv.innerHTML = html.trim();

//     const selectedNodes = {};
//     createDiv.querySelectorAll("[--id]").forEach((sel) => {
//         const names = sel.getAttribute("--id");
//         sel.removeAttribute("--id");
//         names.split(' ').forEach(name => {
//             selectedNodes[name] = sel;
//         });
//     });

//     selectedNodes["root"] = createDiv.childNodes[0];

//     appendChildren(mountPoint, createDiv.childNodes);

//     return selectedNodes;
// };



const __textAt = (str, pos, comparison) => {
    for(let i = 0; i < comparison.length; i++) {
        if (str[pos + i] !== comparison[i]) return false;
    }

    return true;
}

const __getHtmlfArg = (args, i, copyFunc) => {
    if (copyFunc !== null)
        return copyFunc;

    assert(i < args.length, "Too many formatting directives, or not enough formatting args");
    return args[i];
}

/** @returns { HTMLElement } */
const __getHTMLElementForComponentFormatDirective = (componentOrHTMLfReturnVal, errorMsg) => {
    if (typeof componentOrHTMLfReturnVal === typeof "string") return document.createTextNode(componentOrHTMLfReturnVal);
    if (componentOrHTMLfReturnVal.el) return componentOrHTMLfReturnVal.el;
    if (componentOrHTMLfReturnVal[0] && componentOrHTMLfReturnVal[0].el) return componentOrHTMLfReturnVal[0].el;

    throw new Error(errorMsg);
}

// We don't care about performance here. I have made this purely for a bit of a laugh.
// The funny thing is that it is a somewhat valid way to avoid xss, because we are creating text nodes
// rather than putting it directly into the string like `${malicious_code}`.
// I hate that this is actually a good API, the more I use it

/** @augments htmlf */
const htmlf_internal = (html, ...args) => {
    const element = __createHtmlElement(html);
    if (args.length === 0) {
        return [{ el: element }, ...args];
    }

    const nodes = __textNodesUnder(element);
    let currentArgIdx = 0;
    for(let node of nodes) {
        let text = node.nodeValue;
        for(let i = 0; i < text.length; i++) {
            if (text[i] !== "%") continue;

            const formattingDirective = text[i + 1];
            if (
                formattingDirective !== "c" &&  // component, (any JS object with { el: HTMLElement } shape).
                formattingDirective !== "a" &&  // array. inserts multiple things to the dom
                formattingDirective !== "r"     // raw. just throw it in and see what happens. useful for inserting raw dom nodes when inter-operating with other things
            ) {
                throw new Error(`invalid formatting directive - %${formattingDirective || "<end of string>"}`);
            }

            assert(currentArgIdx < args.length, "Too few format args provided to printf - " + `${args}`);

            let arg = args[currentArgIdx];

            let componentsToInsert;
            if(formattingDirective === "c") {
                componentsToInsert = [
                    __getHTMLElementForComponentFormatDirective(
                        arg, 
                        "object", `%c wants components (like { el: html element, ... }) or [ component ], instead we got ${typeof arg} [${arg}]`
                    )
                ];
            } else if(formattingDirective === "a") {
                assert(Array.isArray(arg), `%a wants an array, instead we got ${typeof arg} [${arg}]`);
                componentsToInsert = Array(arg.length);
                for (let i = 0; i < arg.length; i++) {
                    const thing = arg[i];
                    const component = __getHTMLElementForComponentFormatDirective(
                        thing, 
                        `%a wants components like ({ el: html element, ... }) or [ component ] in the array, instead we got ${typeof thing}} [${thing}] at index ${i}`
                    );

                    componentsToInsert[i] = component;
                }
            } else if (formattingDirective === "r") {
                // who knows what this could be ? :thinking:
                componentsToInsert = [arg];
            } else {
                unreachable();
            }

            // insert this thing precisely where we found the formatting directive for it
            const node2 = node.splitText(i);
            for(let j = 0; j < componentsToInsert.length; j++) {
                const component = componentsToInsert[j];
                if (component === null) continue;

                node2.parentNode.insertBefore(component, node2);
            }
            node = node2;
            node.nodeValue = node.nodeValue.substring(2);
            text = node.nodeValue;
            i = -1; //-1 to account for the for-loop incrementing this.
            currentArgIdx++;
        }
    }

    assert(currentArgIdx === args.length, "Too few format directive args were provided");
    return [{ el: element }, ...args];
};

/** 
 * Place components in a html tree with surgical precision using printf-like semantics.
 * %c -> inserts a component or a string.
 *      A component is any object with the shape { el: HTMLNode }.
 *      Arrays like [ { el: HTMLNode }] will also get unwrapped 1 level, because we often want to feed the result of htmlf back into itself.
 * %a -> inserts an array of components
 * %r -> inserts a raw html dom node
 * 
 * 
 * 
 * Note: htmlf doesn't work like a typical printf -
 *      it can only replace formatting directives that are between tags, and not inside tags, like attributes.
 * 
 * @example
 * // this works just fine
 * const [root] = htmlf("<div>%s</div>", userInput);                                        
 * // this works just fine too
 * const [root, [bold]] = htmlf("<div>Hello, %c</div>", htmlf("<b>%s</b>", userInput));     
 * // this won't work, because %s is inside a tag.
 * const [root] = htmlf(`<div style="color:%s">hello</div>`, userInputtedColor)             
 *  */
const htmlf = (html, ...args) => {
    return htmlf_internal(html, ...args);
}

/** @returns {{ el: HTMLElement }} */
const __assertIsComponent = (obj) => {
    assert(obj && obj.el, `assertion obj.el && obj.el instanceof HTMLElement failed for obj: ${obj} [typeof ${typeof obj}] `);
    return obj;
}

// I am still debating whether this is even needed or not
// /** @returns {{ el: HTMLElement, selected: Object<string, HTMLElement> }} */
// const create = (html, initFn) => {
//     const element = __createHtmlElement(null, html);

//     const selectedNodes = {};
//     selectedNodes[element.tagName.toLowerCase()] = element;
//     for(const sel of element.querySelectorAll("[--id]")) {
//         const names = sel.getAttribute("--id");
//         sel.removeAttribute("--id");
//         for(const name of names.split(' ')) {
//             selectedNodes[name] = sel;
//         }
//     }

//     initFn(selectedNodes);

//     return { el: element, selected: selectedNodes };
// };


const array = (n, fn) => [...Array(n)].map(fn);
const replaceChildren2 = (comp, children) => {
    const parent = comp.el;
    const existing = parent.childNodes;

    // remove existing nodes
    let excess = existing.length - children.length;
    for(let i = 0; i < excess; i++) {
        existing[children.length + excess - i - 1].remove();
    }

    // add or replace new nodes, while ignoring unchanged ones
    for(let i = 0; i < children.length; i++) {
        const child = children[i].el;
        if (existing[i] === child) {
            continue;
        }

        if (i < existing.length) {
            parent.replaceChild(child, existing[i]);
        } else {
            parent.appendChild(child);
        }
    }
}

const appendChild = (mountPoint, child) => {
    const mountComponent = __assertIsComponent(mountPoint);
    mountComponent.el.appendChild(child.el);
}

const clearChildren = (mountPoint) => {
    mountPoint.el.replaceChildren();
}

// const __truncateArray = (arr, newMaxSize) => arr.splice(newMaxSize, arr.length - newMaxSize);

/** Maintains a list of data that is always in sync with it's html, provided we only insert/remove things with the methods provided. */
// const htmlList = (root, createFn) => {
//     root = __getHTMLElementForComponentFormatDirective(root);
//     const dataList = [];
//     const componentsList = [];
//     const diffSet = new Set();
//     root.replaceChildren();  // this clears the children, because replaceChildren expects ...args

//     const getChildNodes = () => root.childNodes;

//     const self = {
//         el: root,
//         assertLength: () => {
//             const children = getChildNodes();

//             assert(
//                 dataList.length !== componentsList.length || dataList.length !== children.length,
//                 `${dataList.length} !== ${componentsList.length} || ${dataList.length} !== ${children.length}`
//             );
//         },
//         assertBounds: (i) => {
//             assert(
//                 i >= 0 && i < dataList.length, 
//                 `Index ${i} should have been between 0 and ${dataList.length - 1}`
//             );
//         },
//         length: () => {
//             self.assertLength();
//             return dataList.length;
//         },
//         push: (data) => {
//             const children = getChildNodes();
//             self.insertAt(children.length, data);
//         },
//         insertAt: (i, data) => {
//             assert(
//                 i >= 0 && i <= dataList.length, 
//                 `Index ${i} should have been between 0 and ${dataList.length}`
//             );

//             const newComponent = createFn(data, self);
//             const children = getChildNodes();
//             if (i === children.length) {
//                 root.appendChild(newComponent.el)
//                 dataList.push(data)
//                 componentsList.push(newComponent);
//             } else {
//                 root.insertBefore(newComponent.el, children[i]);
//                 dataList.splice(i, 0, data);
//                 componentsList.splice(i, 0, newComponent);
//             }

//             try {
//                 newComponent.onInsert && newComponent.onInsert();            
//             } catch(err) {
//                 console.error(err);
//             }

//             return newComponent;
//         },
//         removeAt: (i) => {
//             if (dataList.length === 0) {
//                 return;
//             }

//             self.assertBounds(i);

//             const children = getChildNodes();
//             children[i].remove();
//             const component = componentsList[i];

//             try {
//                 component.onRemove && component.onRemove();
//             } catch(err) {
//                 throw err;
//                 console.error(err);
//             }

//             componentsList.splice(i, 1);    
//             dataList.splice(i, 1);
//         },
//         replaceAll: (newData) => {
//             const children = getChildNodes();
//             for(let i = children.length - 1; i >= 0; i--) {
//                 self.removeAt(i);
//             }
//             dataList.splice(0, dataList.length);
//             componentsList.splice(0, componentsList.length);

//             for(let i = 0; i < newData.length; i++) {
//                 self.insertAt(i, newData[i])
//             }
//         },
//         /** Diff the current data with the new data, making as few inserts and removes as possible. Assumes most things are in still in the same order. */
//         replaceAllSmart: (newData) => {
//             diffSet.clear();

//             let i = 0,  // old
//                 j = 0;  // new
            

//             const diffs = [

//             ];

//             // we want to remove and insert as few things as possible.
//             for(let i = 0; i < newData.length; i++) {
//                 if (dataList[i] === newData[i]) continue;

//                 diffs.push()
//             }

//             assert(newData.length === dataList.length, "something wrong with the diff algo");
//             for(let i = 0; i < dataList.length; i++) {
//                 assert(newData[i] !== dataList[i], "something wrong with the diff algo");
//             }
//         },
//         dataAt: (i) => {
//             self.assertBounds(i);
//             return dataList[i];
//         },
//         componentAt: (i) => {
//             self.assertBounds(i);
//             return componentsList[i];
//         },
//         indexOf: (data) => {
//             for(let i = 0; i < dataList.length; i++) {
//                 if(dataList[i] === data) {
//                     return i;
//                 }
//             }

//             return -1;
//         },
//         /** NOTE: this returns a shallow copy */
//         toArray: () => [...dataList]
//     }

//     self.replaceAll(dataList);

//     return self;
// }

const append = (comp, newChild) => {
    comp.el.parentNode.appendChild(newChild.el);
}

const setVisible = (component, state) => {
    if (state) {
        component.el.classList.remove("hidden");
    } else {
        component.el.classList.add("hidden");
    }
    return state;
}

const event = (comp, event, fn) => {
    comp.el.addEventListener(event, fn);
}

const resizeComponentPool = (root, compPool, newLength, createFn) => {
    while(compPool.length > newLength) {
        // could also just hide these with setVisible(false)
        const component = compPool.pop();
        component.el.remove();
    } 
    
    while (compPool.length < newLength) {
        // could also just show these with setVisible(true)
        const component = createFn();
        compPool.push(component);
        appendChild(root, component);
    }
}

const eventListener = (mountPoint, event, fn) => {
    mountPoint.el.addEventListener(event, fn);
}

const setTextContent = (component, text) => {
    if (component.el.textContent !== text) {
        component.el.textContent = text;    // a huge performance speedup!
    }
}