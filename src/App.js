import React, { useState, useRef } from 'react'
import { triggerBase64Download } from 'react-base64-downloader';
import styled from 'styled-components'
import Jimp from 'jimp'

function App() {
    const inputPics = useRef()
    const [refPic, setRefPic] = useState()
    const [inputPicsState, setInputPicsState] = useState([])
    const [reductionRatio, setReductionRatio] = useState(10)
    const [inputSize, setInputSize] = useState(35)
    const [working, setWorking] = useState()
    const [modal, setModal] = useState({
        visible: false
    })

    const loadFiles = (files, type) => {
        let filesReady = [];
        [...files].forEach((f, i, arr) => {
            const reader = new FileReader()
            reader.readAsDataURL(f);
            reader.onloadend = () => {
                if(type === "input"){
                    filesReady.push({
                        original: reader.result
                    })
                    if(arr.length === i + 1){
                        setInputPicsState([...(inputPics.current ?? []), ...filesReady])
                        inputPics.current = [...(inputPics.current ?? []), ...filesReady]
                    }
                }
                else{ 
                    setRefPic(reader.result) 
                }
            }
        })
    }


    const processRefImage = () => {
        setWorking("Reading reference image")
        Jimp.read(refPic, (err, pic) => {
            const h = Math.trunc(pic.bitmap.height / reductionRatio)
            const w = Math.trunc(pic.bitmap.width / reductionRatio)
            const t = h * w
            const resizedPic = getResizedPic(pic, w, h)
            const pixelColorArr = Array(t).fill(null).map((e, i) => {
                const x = i % w
                const y = Math.trunc(i / w)
                return {
                    x,
                    y,
                    color: Jimp.intToRGBA(resizedPic.getPixelColor(x, y))
                }
            })

            setWorking(`Comparing each pixel of the reference image with the input files`) 
            const fullArray = pixelColorArr.map((px, i, arr) => {
                return ({
                    ...px,
                    composePic: getClosestPic(px, inputPics.current, i+1, arr.length)
                })
            })
            
            setWorking(`Composing the whole image`)
            stitchItAll(fullArray, w, h)
        })
    }

    const getAvgColor = pic => {
        const h = pic.bitmap.height
        const w = pic.bitmap.width
        const t = h * w
        const pixelColorArr = Array(t).fill(null).map((e, i) => {
            const x = i % w
            const y = Math.trunc(i / w)
            return Jimp.intToRGBA(pic.getPixelColor(x, y))
        })
        const avgColorPre = pixelColorArr.reduce((acc, it) => {
            return {
                r: it.r + acc.r,
                g: it.g + acc.g,
                b: it.b + acc.b
            }
        }, {r: 0, g: 0, b: 0})
        return {
            r: Math.round(avgColorPre.r / t),
            g: Math.round(avgColorPre.g / t),
            b: Math.round(avgColorPre.b / t)
        }
    }

    const getClosestPic = (pixel, inputPics, i, len) => {
        const closest = inputPics.map(ip => ({
            ...ip,
            diff: getColorDifference(ip.avgColor, pixel.color)
        })).sort((a, b) => {
            if(a.diff > b.diff){ return 1 }
            else{ return -1 }
        })[0]
        return closest.resized
    }

    const getColorDifference = (color1 = {}, color2 = {}) => {
        const deltaR = Math.abs(color1.r - color2.r)
        const deltaG = Math.abs(color1.g - color2.g)
        const deltaB = Math.abs(color1.b - color2.b)
        return deltaR + deltaG + deltaB
    }

    const cropImgToSquare = pic => {
        const h = pic.bitmap.height
        const w = pic.bitmap.width
        return pic.crop(
            w > h ? (w-h)/2 : 0, 
            w > h ? 0 : (h-w)/2,
            w > h ? h : w, 
            w > h ? h : w
        )
    }

    const getResizedPic = (pic, w, h = w) => {
        return pic.resize(parseInt(w), parseInt(h))
    }

    const moveYourMoneyMaker = async () => {
        if(!Array.isArray(inputPics.current) || inputPics.current?.length === 0){
            setModal({
                visible: true,
                text: "Select input files"
            })
            return
        }
        if(!refPic){
            setModal({
                visible: true,
                text: "Select reference image"
            })
            return
        }

        Jimp.read(refPic, (err, pic) => {
            const h = Math.trunc(pic.bitmap.height / reductionRatio) * inputSize
            const w = Math.trunc(pic.bitmap.width / reductionRatio) * inputSize
            console.log({h, w})
            if(h > 5000 || w > 5000){
                setWorking(" ")
                setModal({
                    visible: true,
                    text: `The dimensions of the output image with the selected reduction ratio and square size will be ${w}*${h}. 
Generating images so big can slow down your browser and even crash it.
Do you want to continue?`,
                    fn: () => {
                        setModal({ visible: false })
                        iHaveNoFear()
                    }
                })
            }
            else{
                iHaveNoFear()
            }
        })

        const iHaveNoFear = async () => {
            inputPics.current.forEach((ip, i, arr) => {
                setWorking("Reading input pics")
                Jimp.read(ip.original, (err, pic) => {
                    setWorking(`Processing input pics`)
                    const avgColor = getAvgColor(pic)
                    const croppedImage = cropImgToSquare(pic)
                    const resized = getResizedPic(croppedImage, inputSize)

                    inputPics.current.forEach((ip, j, arr) => {
                        if(i === j){
                            inputPics.current[i] = {
                                ...inputPics.current[i],
                                avgColor,
                                resized
                            }
                        }
                        if(arr.length === i + 1 && arr.length === j + 1){
                            processRefImage()
                        }
                    })
                })
            })
        }
    }

    const stitchItAll = (arr, w, h) => {
        new Jimp(w * inputSize, h * inputSize, 0xffffff, (err, img) => {
            arr.forEach((px, i, arr) => {
                img.composite(
                    px.composePic,
                    px.x * inputSize, 
                    px.y * inputSize
                );  
                if(arr.length === i + 1){
                    upAndOut(img)
                }
            })
        })
    }

    const upAndOut = async img => {
        setWorking(`Converting to base 64...`)
        img.quality(60)
        const b64img = await img.getBase64Async(Jimp.MIME_JPEG)
        setWorking(`Downloading...`)
        triggerBase64Download(b64img, `Multipic-${new Date().getTime()}`)
        setWorking(false)
    }
    
    return (
        <Container working={working}>
            { working && <Loader><span>{ working }</span></Loader> }

            <H1 style={{ marginTop: 0 }}>Multipic</H1>
            
            <Block>
                <H3>Input images</H3>
                <CustomFile htmlFor="file-upload-input">
                    Select images
                </CustomFile>
                <input id="file-upload-input" type="file" multiple onChange={e => loadFiles(e.target.files, "input")} />
                { inputPicsState?.length > 0 && (
                    <ImageGrid>
                        { inputPicsState?.map((pic, i) => <Image key={`ip-${i}`} src={pic.original} onClick={() => {
                            const filteredArray = inputPicsState.filter((ip, j) => i !== j)
                            setInputPicsState(filteredArray)
                            inputPics.current = filteredArray
                        }} /> ) }
                    </ImageGrid>
                )}
            </Block>
            
            <Block>
                <H3>Reference image</H3>
                <CustomFile htmlFor="file-upload-ref">
                    Select image
                </CustomFile>
                <input id="file-upload-ref" type="file" onChange={e => loadFiles(e.target.files, "ref")} />
                { refPic && (
                    <div>
                        <br />
                        <Image src={refPic} style={{ width: 200, height: 200 }} onClick={() => setRefPic()} />
                    </div>
                )}
            </Block>

            <Block>
                <H3>Parameters</H3>
                <InputGroup>
                    <label>Reduction ratio</label>
                    <Info onClick={() => {
                        setWorking(" ")
                        setModal({
                            visible: true,
                            text: "This ratio will divide the size of the reference size. Per example, a 1000*800 image with a reduction ratio of 10 will have 100*80 pixels substituted with your input images",
                            cancelText: "Umh, if you say so",
                            okText: "OK!",
                            fn: () => {
                                setModal({ visible: false })
                                setWorking(false)
                            }
                        })
                    }}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="10 10 150 150" height="25" width="25" version="1.0">
                            <g fill="#4b4b4b">
                                <path d="m80 15c-35.88 0-65 29.12-65 65s29.12 65 65 65 65-29.12 65-65-29.12-65-65-65zm0 10c30.36 0 55 24.64 55 55s-24.64 55-55 55-55-24.64-55-55 24.64-55 55-55z"/>
                                <path d="m57.373 18.231a9.3834 9.1153 0 1 1 -18.767 0 9.3834 9.1153 0 1 1 18.767 0z" transform="matrix(1.1989 0 0 1.2342 21.214 28.75)"/>
                                <path d="m90.665 110.96c-0.069 2.73 1.211 3.5 4.327 3.82l5.008 0.1v5.12h-39.073v-5.12l5.503-0.1c3.291-0.1 4.082-1.38 4.327-3.82v-30.813c0.035-4.879-6.296-4.113-10.757-3.968v-5.074l30.665-1.105"/>
                            </g>
                        </svg>
                    </Info>
                    <input value={reductionRatio} onChange={e => setReductionRatio(e.target.value)} type="number" />
                </InputGroup>
                <InputGroup>
                    <label>Square size</label>
                    <Info onClick={() => {
                        setWorking(" ")
                        setModal({
                            visible: true,
                            text: "This is the size your input images will have in the output image. Per example, with a square size of 35, each one of the pixels of the reduced reference image will be substituted with an input image with a size of 35*35px",
                            cancelText: "I dunno...",
                            okText: "Gotcha!",
                            fn: () => {
                                setModal({ visible: false })
                                setWorking(false)
                            }
                        })
                    }}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="10 10 150 150" height="25" width="25" version="1.0">
                            <g fill="#4b4b4b">
                                <path d="m80 15c-35.88 0-65 29.12-65 65s29.12 65 65 65 65-29.12 65-65-29.12-65-65-65zm0 10c30.36 0 55 24.64 55 55s-24.64 55-55 55-55-24.64-55-55 24.64-55 55-55z"/>
                                <path d="m57.373 18.231a9.3834 9.1153 0 1 1 -18.767 0 9.3834 9.1153 0 1 1 18.767 0z" transform="matrix(1.1989 0 0 1.2342 21.214 28.75)"/>
                                <path d="m90.665 110.96c-0.069 2.73 1.211 3.5 4.327 3.82l5.008 0.1v5.12h-39.073v-5.12l5.503-0.1c3.291-0.1 4.082-1.38 4.327-3.82v-30.813c0.035-4.879-6.296-4.113-10.757-3.968v-5.074l30.665-1.105"/>
                            </g>
                        </svg>
                    </Info>
                    <input value={inputSize} onChange={e => setInputSize(e.target.value)} type="number" />
                </InputGroup>
            </Block>

            <br />
            <TheButton style={{ marginTop: "1em" }} onClick={() => moveYourMoneyMaker()}>Let's go!</TheButton>

            { modal.visible && (
                <Modal>
                    <H3>{modal.text}</H3>
                    <ButtonWrapper>
                        {modal.fn && <TheButton style={{ marginRight: 10 }} onClick={() => modal.fn()}>{ modal.okText || "Continue" }</TheButton>}
                        <TheButton onClick={() => {
                            setModal({ visible: false })
                            setWorking(false)
                        }}>{ modal.cancelText || "Cancel" }</TheButton>
                    </ButtonWrapper>
                </Modal>
            )}
            <CopyrightWrapper>
                <p>2020 -&nbsp;<a href="https://alhill.dev">Al Hill</a></p>
                <p>The source code of this application can be downloaded&nbsp;<a href="https://github.com/alhill/multipic">here</a>. Use it wisely.</p>
            </CopyrightWrapper>
        </Container>

    );
}

const Container = styled.div`
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    padding-bottom: 1em;
    height: ${({ working }) => working ? "100vh" : "auto"};
    overflow: hidden;
    min-height: 100vh;
`

const Loader = styled.div`
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    min-height: 100vh;
    z-index: 100;
    background-color: rgba(240, 240, 240, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    span {
        font-size: 1.8em;
    }
`

const H1 = styled.h1`
    margin: 1em 0;
    padding: 1em 0 0 0;
    color: #666;
    font-size: 3em;
    font-family: Lexend Tera;
`
    
const H3 = styled.h3`
    font-family: Lexend Tera;
    margin-top: 0;
    color: #555;
`

const CopyrightWrapper = styled.div`
    font-family: Lexend Tera;
    color: #999;
    font-size: 1em;
    flex: 1;
    display: flex;
    flex-direction: column;
    flex-wrap: wrap;
    align-items: center;
    text-align: center;
    justify-content: flex-end;
    align-content: flex-end;
    a{
        text-decoration: none;
        color: #666;
        transition: all 300ms;
        &:hover{
            color: black;
        }
    }
    p{
        margin: 0.5em 0;
    }
`

const ImageGrid = styled.div`
    display: flex;
    flex-wrap: wrap;
    margin-top: 2em;
`
const Image = styled.img`
    border-radius: 4px;
    width: 100px;
    height: 100px;
    object-fit: cover;
    object-position: center center;
    margin: 0 1em 1em 0;
    transition: all 300ms;
    box-shadow: 1px 1px 3px 1px rgba(0, 0, 0, 0.1);    
    &:hover{
        filter: saturate(0.5) brightness(0.5);
        transform: scale(1.1);
    }
`
const Block = styled.div`
    padding: 1em;
    margin-top: 1em;
    border-radius: 2px;
    background: linear-gradient(45deg, rgba(56,239,125, 0.2), rgba(17,153,142, 0.2));
    width: calc(100% - 4em);
`

const InputGroup = styled.div`
    display: flex;
    margin-bottom: 1em;
    align-items: center;
    label{
        color: #555;
        width: 200px;
    }
    input {
        height: 24px;
        padding: 6px;
        font-family: Lexend Tera;
        color: #555;
        background-color: rgba(255, 255, 255, 0.7);
        border-radius: 2px;
        font-size: 1.3em;
        border: none;
        width: 100px;
    }
` 

const TheButton = styled.div`
    width: 240px;
    height: 40px;
    background-color: #555;
    color: #fcfcfc;
    border-radius: 2px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-weight: bold;
    transition: all 100ms;
    box-shadow: 1px 1px 0 #bbb;
    cursor: pointer;
    &:hover{
        filter: brightness(0.95);
        box-shadow: 5px 5px 0 #ccc;    
    }
`

const CustomFile = styled.label`
    width: 240px;
    height: 40px;
    background-color: #555;
    color: #fcfcfc;
    border-radius: 2px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-weight: bold;
    transition: all 100ms;
    box-shadow: 1px 1px 0 #ccc;
    cursor: pointer;
    &:hover{
        filter: brightness(0.95);
        box-shadow: 5px 5px 0 #ccc;    
    }
` 

const Modal = styled.div`
    position: absolute;
    top: 100px;
    min-width: 300px;
    width: 60vw;
    min-height: 240px;
    border: 3px solid pink;
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    justify-content: space-evenly;
    align-items: center;
    background-color: rgba(255, 255, 255, 0.95);
    padding: 1em 2em;
    z-index: 200;
`
const ButtonWrapper = styled.div`
    display: flex;
    width: 100%;
    justify-content: space-evenly;
`

const Info = styled.div`
    width: 25px;
    height: 25px;
    opacity: 0.4;
    transition: all 300ms;
    padding-right: 2em;
    &:hover{
        opacity: 0.7;
    }
`
    
export default App;
    