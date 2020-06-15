import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components'
import Jimp from 'jimp'

function App() {
    const inputPics = useRef()
    const [refPic, setRefPic] = useState()
    const [inputPicsState, setInputPicsState] = useState([])
    const [reductionRatio, setReductionRatio] = useState(2)
    const [inputSize, setInputSize] = useState(50)
    const [done, setDone] = useState(false)
    const [result, setResult] = useState()
    const [working, setWorking] = useState()

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
                        setInputPicsState(filesReady)
                        inputPics.current = filesReady
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

            const fullArray = pixelColorArr.map((px, i, arr) => {
                return ({
                    ...px,
                    composePic: getClosestPic(px, inputPics.current, i+1, arr.length)
                })
            })
            
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
        if(!(i % 100)){ setWorking(`Comparing each pixel of the reference image with the input files (${i}/${len})`) }
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
            alert("Select input files")
            return
        }
        if(!refPic){
            alert("Select reference image")
            return
        }

        inputPics.current.map((ip, i, arr) => {
            setWorking("Reading input pics")
            Jimp.read(ip.original, (err, pic) => {

                setWorking(`Processing input pics (${i+1}/${arr.length})`)
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

    const stitchItAll = (arr, w, h) => {
        new Jimp(w * inputSize, h * inputSize, 0xffffff, (err, img) => {
            arr.forEach((px, i, arr) => {
                if(!(i % 100)){ setWorking(`Composing the whole image (${i+1}/${arr.length})`) }
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
        const b64img = await img.getBase64Async(Jimp.MIME_JPEG)
        setResult(b64img)
        setDone(true)
        setWorking(false)
    }
    
    return (
        <Container>
            { working && <Loader><span>{ working }</span></Loader> }

            <H1 style={{ marginTop: 0 }}>Multipic</H1>
            
            <Block>
                <H3>Input files</H3>
                <input type="file" multiple onChange={e => loadFiles(e.target.files, "input")} />
                <ImageGrid>
                    { inputPicsState?.length > 0 && inputPicsState?.map((pic, i) => <Image key={`ip-${i}`} src={pic.original} /> )}
                </ImageGrid>
            </Block>
            
            <Block>
                <H3>Reference image</H3>
                <input type="file" onChange={e => loadFiles(e.target.files, "ref")} />
                { refPic && (
                    <div>
                        <br />
                        <Image src={refPic} />
                    </div>
                )}
            </Block>

            <Block>
                <H3>Parameters</H3>
                <InputGroup>
                    <label>Reduction ratio</label>
                    <input value={reductionRatio} onChange={e => setReductionRatio(e.target.value)} type="number" />
                </InputGroup>
                <InputGroup>
                    <label>Input size</label>
                    <input value={inputSize} onChange={e => setInputSize(e.target.value)} type="number" />
                </InputGroup>
            </Block>

            <br />
            <TheButton onClick={() => moveYourMoneyMaker()}>Hacer cosas</TheButton>

            { done && <Result src={result} /> }
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
`

const Loader = styled.div`
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    min-height: 100vh;
    z-index: 100;
    background-color: rgba(222, 222, 222, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    span {
        font-size: 2em;
    }
`

const H1 = styled.h1`
    margin: 0;
    padding: 0.5em 0 0 1em;
`

const H3 = styled.h3`
    margin-top: 0;
`

const ImageGrid = styled.div`
    display: flex;
    flex-wrap: wrap;
    margin-top: 1em;
`
const Image = styled.img`
    border-radius: 4px;
    width: 100px;
    height: 100px;
    object-fit: cover;
    object-position: center center;
    margin: 0 10px 10px 0;
`
const Block = styled.div`
    padding: 1em;
    margin-top: 1em;
    border: 1px solid gainsboro;
    border-radius: 8px;
    width: 95vw;
`

const InputGroup = styled.div`
    display: flex;
    margin-bottom: 1em;
    align-items: center;
    label{
        margin-right: 1em;
    }
    input {
        height: 24px;
    }
` 

const TheButton = styled.div`
    width: 140px;
    height: 40px;
    background-color: gainsboro;
    border-radius: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-weight: bold;
    transition: all 100ms;
    box-shadow: 1px 1px 0 grey;
    &:hover{
        filter: brightness(0.95);
        box-shadow: 3px 3px 0 grey;    
    }
`

const Result = styled.img`
    margin-top: 1em;
    max-width: 90vw;
`
    
export default App;
    